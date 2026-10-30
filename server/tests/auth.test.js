import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { openDatabase } from "../src/db/connection.js";
import { authRepository } from "../src/repositories/auth.js";
import { authService, tokenHash } from "../src/services/auth.js";
import { validatePassword } from "../src/utils/passwords.js";
import { createApp } from "../src/app.js";
import { createDemo } from "../test-support/demo-scenarios.js";

const origin = "http://localhost:5173";
const password = () => randomBytes(24).toString("base64url");
async function setup(t, options = {}) {
  const db = openDatabase(":memory:"), repo = authRepository(db), service = authService(repo);
  const credentials = { name: "Test organizer", email: "organizer@auth.invalid", password: password() };
  const admin = await service.bootstrap(credentials);
  const server = createApp(db, options).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, body, cookie, method = body === undefined ? "GET" : "POST", requestOrigin = origin) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json",
      ...(requestOrigin === undefined || requestOrigin === null ? {} : { Origin: requestOrigin }), ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie"), headers: response.headers };
  }
  async function login(account = credentials, oldCookie) {
    return call("/auth/login", { email: account.email, password: account.password }, oldCookie);
  }
  return { db, repo, service, credentials, admin, call, login, base };
}
const cookieValue = (response) => response.cookie.split(";")[0];

test("bootstrap is controlled, stores salted bcrypt hashes and never reinitializes", async (t) => {
  const { repo, service, credentials, admin, db } = await setup(t);
  const credential = repo.credentials(credentials.email);
  assert.equal(admin.role, "ADMIN"); assert.ok(!("passwordHash" in admin));
  assert.match(credential.passwordHash, /^\$2[aby]\$12\$/); assert.notEqual(credential.passwordHash, credentials.password);
  await assert.rejects(service.bootstrap({ ...credentials, email: "other@auth.invalid" }), { code: "ALREADY_INITIALIZED" });
  assert.equal(db.prepare("SELECT count(*) n FROM users").get().n, 1);
  await assert.rejects(service.createStaff(admin, { name: "Escalation", email: "staff@auth.invalid", password: password(), role: "ADMIN" }));
});

test("normalized unique emails, staff creation, role protection and disabled users", async (t) => {
  const { service, admin, login, call } = await setup(t);
  const session = cookieValue(await login());
  const staffAccount = { name: "Staff", email: " STAFF@Auth.invalid ", password: password() };
  const created = await call("/users", staffAccount, session);
  assert.equal(created.status, 201); assert.equal(created.body.data.email, "staff@auth.invalid");
  assert.equal(created.body.data.role, "STAFF"); assert.ok(!JSON.stringify(created.body).includes("password"));
  assert.equal((await call("/users", { ...staffAccount, email: "staff@auth.invalid" }, session)).status, 409);
  const staffLogin = await login(staffAccount), staffCookie = cookieValue(staffLogin);
  assert.equal((await call("/users", undefined, staffCookie)).status, 403);
  assert.equal((await call("/users", { name: "Other", email: "other@auth.invalid", password: password() }, staffCookie)).status, 403);
  assert.equal((await call(`/users/${created.body.data.id}/status`, { active: false }, session, "PATCH")).status, 200);
  assert.equal((await call("/auth/me", undefined, staffCookie)).status, 401);
  const disabled = await login(staffAccount); assert.equal(disabled.status, 401); assert.equal(disabled.body.error.code, "INVALID_CREDENTIALS");
  assert.equal((await call(`/users/${created.body.data.id}/status`, { active: true }, session, "PATCH")).status, 200);
  assert.equal((await login(staffAccount)).status, 200);
  assert.equal((await call(`/users/${admin.id}/status`, { active: false }, session, "PATCH")).status, 400);
  assert.equal((await call("/users/999/status", { active: false }, session, "PATCH")).status, 404);
  await assert.rejects(service.createStaff(created.body.data, { name: "x", email: "x@auth.invalid", password: password() }), { code: "FORBIDDEN" });
});

test("login produces opaque protected cookies, hash-only session storage and no credential response", async (t) => {
  const { login, call, db, credentials } = await setup(t);
  const response = await login(); assert.equal(response.status, 200);
  assert.match(response.cookie, /HttpOnly/); assert.match(response.cookie, /SameSite=Strict/); assert.match(response.cookie, /Path=\//);
  assert.match(response.cookie, /Max-Age=28800/); assert.ok(!response.cookie.includes("Secure"));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const raw = cookieValue(response).split("=")[1]; assert.equal(raw.length, 43);
  const stored = db.prepare("SELECT * FROM sessions").get(); assert.equal(stored.token_hash, tokenHash(raw));
  assert.notEqual(stored.token_hash, raw);
  assert.equal(response.body.data.email, credentials.email);
  assert.ok(!JSON.stringify(response.body).includes(credentials.password));
  assert.ok(!JSON.stringify(response.body).includes(raw));
  assert.deepEqual((await call("/auth/me", undefined, cookieValue(response))).body.data, response.body.data);
  assert.equal((await call("/bookings", undefined, cookieValue(response))).status, 200);
});

test("HTTPS cookie configuration sets Secure", async (t) => {
  const { login } = await setup(t, { secureCookies: true });
  assert.match((await login()).cookie, /; Secure/);
});

test("unknown/incorrect credentials use generic errors and malformed credentials fail safely", async (t) => {
  const { call, credentials } = await setup(t);
  const wrong = await call("/auth/login", { email: credentials.email, password: password() });
  const unknown = await call("/auth/login", { email: "unknown@auth.invalid", password: password() });
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, unknown.body);
  for (const body of [null, [], {}, { email: "x", password: "x" }, { email: credentials.email, password: 123 }, { email: credentials.email, password: "x".repeat(73) }])
    assert.equal((await call("/auth/login", body)).status, 400);
});

test("persistent login throttling bounds repeated failed credentials", async (t) => {
  const { call, db, credentials } = await setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await call("/auth/login", { email: credentials.email, password: password() })).status, 401);
  assert.equal((await call("/auth/login", credentials)).status, 429);
  assert.ok(db.prepare("SELECT count(*) n FROM login_attempts").get().n >= 1);
  db.prepare("UPDATE login_attempts SET resets_at=?").run(Date.now() - 1);
  assert.equal((await call("/auth/login", credentials)).status, 200);
});

test("every operational API is guarded; health remains public", async (t) => {
  const { call } = await setup(t);
  for (const path of ["/bookings", "/bookings/1", "/clients", "/venues", "/dashboard", "/analytics/resources?venueId=1&date=2030-01-01", "/users", "/auth/me"])
    assert.equal((await call(path)).status, 401, path);
  for (const [path, method] of [["/bookings", "POST"], ["/clients", "POST"], ["/bookings/1/cancel", "PATCH"], ["/bookings/1/reschedule", "PATCH"],
    ["/recommendations", "POST"], ["/bookings/1/recommendations", "POST"], ["/simulation", "POST"], ["/availability/check", "POST"], ["/users", "POST"]])
    assert.equal((await call(path, {}, undefined, method)).status, 401, path);
  assert.equal((await call("/health")).status, 200);
  assert.equal((await call("/auth/register", {})).status, 401);
});

test("origin protection rejects cross-site and originless mutations including login", async (t) => {
  const { call, login, credentials } = await setup(t), cookie = cookieValue(await login());
  for (const supplied of ["https://attacker.invalid", "null", null]) {
    assert.equal((await call("/auth/login", credentials, undefined, "POST", supplied)).status, 403);
    assert.equal((await call("/clients", { name: "Cross-site" }, cookie, "POST", supplied)).status, 403);
    assert.equal((await call("/auth/logout", {}, cookie, "POST", supplied)).status, 403);
  }
  assert.equal((await call("/auth/me", undefined, cookie)).status, 200);
});

test("expired, forged, duplicated and logged-out session cookies cannot access records", async (t) => {
  const { call, login, db } = await setup(t), response = await login(), cookie = cookieValue(response);
  assert.equal((await call("/clients", undefined, "eventsync_session=forged")).status, 401);
  assert.equal((await call("/clients", undefined, `${cookie}; ${cookie}`)).status, 401);
  db.prepare("UPDATE sessions SET expires_at=?").run(Date.now() - 1);
  assert.equal((await call("/clients", undefined, cookie)).status, 401);
  const fresh = cookieValue(await login());
  const logout = await call("/auth/logout", {}, fresh);
  assert.equal(logout.status, 200); assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
  assert.equal((await call("/clients", undefined, fresh)).status, 401);
  assert.equal(db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
});

test("login rotates a previously supplied session identifier", async (t) => {
  const { login, call } = await setup(t), first = cookieValue(await login()), second = cookieValue(await login(undefined, first));
  assert.notEqual(first, second); assert.equal((await call("/auth/me", undefined, first)).status, 401);
  assert.equal((await call("/auth/me", undefined, second)).status, 200);
});

test("profile updates are real and cannot change role/email", async (t) => {
  const { login, call } = await setup(t), cookie = cookieValue(await login());
  const updated = await call("/auth/profile", { name: "Updated organizer" }, cookie, "PATCH");
  assert.equal(updated.status, 200); assert.equal((await call("/auth/me", undefined, cookie)).body.data.name, "Updated organizer");
  for (const body of [{ name: "" }, { role: "ADMIN" }, { name: "x", email: "other@auth.invalid" }])
    assert.equal((await call("/auth/profile", body, cookie, "PATCH")).status, 400);
});

test("password changes require current password and revoke every session", async (t) => {
  const { login, call, credentials } = await setup(t), first = cookieValue(await login()), second = cookieValue(await login());
  assert.equal((await call("/auth/change-password", { currentPassword: password(), newPassword: password() }, first)).status, 400);
  assert.equal((await call("/auth/change-password", { currentPassword: credentials.password, newPassword: "short" }, first)).status, 400);
  const next = password();
  assert.equal((await call("/auth/change-password", { currentPassword: credentials.password, newPassword: next }, first)).status, 200);
  assert.equal((await call("/auth/me", undefined, first)).status, 401); assert.equal((await call("/auth/me", undefined, second)).status, 401);
  assert.equal((await login()).status, 401); assert.equal((await login({ ...credentials, password: next })).status, 200);
  assert.throws(() => validatePassword("é".repeat(37)));
  assert.throws(() => validatePassword("😀".repeat(6)));
  assert.equal(validatePassword("😀".repeat(12)), "😀".repeat(12));
});

test("operator recovery changes the stored password and revokes sessions", async (t) => {
  const { service, login, call, credentials } = await setup(t), cookie = cookieValue(await login()), next = password();
  await service.recover(credentials.email, next);
  assert.equal((await call("/auth/me", undefined, cookie)).status, 401);
  assert.equal((await login()).status, 401); assert.equal((await login({ ...credentials, password: next })).status, 200);
});

test("additive migration/reopening preserve bookings, inventory, keys, accounts and valid sessions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eventsync-auth-migration-")), path = join(directory, "db.sqlite");
  let db = openDatabase(path);
  try {
    createDemo(db);
    db.prepare("UPDATE venues SET total_staff=9 WHERE id=1").run();
    db.prepare("UPDATE halls SET capacity=61 WHERE id=1").run();
    db.exec("DROP TABLE login_attempts; DROP TABLE sessions; DROP TABLE users;");
    const legacyNames = ["clients", "bookings", "venues", "halls", "recommendation_confirmations"];
    const legacy = legacyNames.map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    db.close(); db = openDatabase(path);
    assert.deepEqual(legacyNames.map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()), legacy);
    assert.equal(authRepository(db).userCount(), 0);
    const service = authService(authRepository(db)), credentials = { name: "Migration admin", email: "migration@auth.invalid", password: password() };
    await service.bootstrap(credentials);
    const session = await service.login(credentials, "migration-fixture");
    const names = ["clients", "bookings", "venues", "halls", "recommendation_confirmations", "users", "sessions"];
    const before = names.map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    db.close(); db = openDatabase(path);
    assert.deepEqual(names.map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()), before);
    assert.equal(authService(authRepository(db)).session(session.token).email, credentials.email);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("controlled bootstrap CLI accepts protected stdin and refuses a second bootstrap", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eventsync-auth-cli-")), path = join(directory, "db.sqlite");
  const credentials = { name: "CLI admin", email: "cli@auth.invalid", password: password() };
  async function run(operation) {
    const child = spawn(process.execPath, [resolve("../scripts/accounts.js"), operation, "--stdin"], {
      cwd: resolve(".."), env: { ...process.env, DB_PATH: path }, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    child.stdin.end(JSON.stringify(credentials));
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    return { code, output };
  }
  try {
    const first = await run("bootstrap"); assert.equal(first.code, 0); assert.ok(!first.output.includes(credentials.password));
    assert.equal((await run("bootstrap")).code, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
