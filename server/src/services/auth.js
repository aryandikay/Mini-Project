import { createHash, randomBytes } from "node:crypto";
import { bodyObject, text } from "../utils/validation.js";
import { AppError, invalid } from "../utils/errors.js";
import { hashPassword, verifyPassword, validatePassword, dummyHash } from "../utils/passwords.js";

export const SESSION_MS = 8 * 60 * 60 * 1000;
export const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
function emailAddress(value) {
  const email = text(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid("Enter a valid email address.");
  return email;
}
function account(body) {
  bodyObject(body);
  if (Object.keys(body).some((key) => !["name", "email", "password"].includes(key))) invalid("Account creation accepts name, email and password only.");
  return { name: text(body.name, "Name", 120), email: emailAddress(body.email), password: validatePassword(body.password) };
}
function badLogin() { return new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."); }
function admin(repo, actor) {
  const current = repo.user(actor?.id);
  if (!current?.active || current.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Administrator access is required.");
}
export function authService(repo) {
  function unique(input) {
    if (repo.credentials(input.email)) throw new AppError(409, "EMAIL_EXISTS", "An account with that email already exists.");
  }
  return {
    async bootstrap(body) {
      const input = account(body), passwordHash = await hashPassword(input.password);
      return repo.transaction(() => {
        if (repo.userCount()) throw new AppError(409, "ALREADY_INITIALIZED", "An administrator already exists. Use administrator account management or local recovery.");
        return repo.create({ ...input, passwordHash, role: "ADMIN" });
      });
    },
    async createStaff(actor, body) {
      admin(repo, actor);
      const input = account(body), passwordHash = await hashPassword(input.password);
      return repo.transaction(() => { admin(repo, actor); unique(input); return repo.create({ ...input, passwordHash, role: "STAFF" }); });
    },
    users(actor) { admin(repo, actor); return repo.users(); },
    status(actor, id, body) {
      bodyObject(body);
      if (Object.keys(body).length !== 1 || typeof body.active !== "boolean") invalid("Supply active as a boolean.");
      return repo.transaction(() => {
        admin(repo, actor);
        const user = repo.user(id);
        if (!user) throw new AppError(404, "NOT_FOUND", "User not found.");
        if (user.role === "ADMIN") invalid("The bootstrap administrator cannot be disabled here.");
        const updated = repo.status(id, body.active);
        if (!body.active) repo.revokeUser(id);
        return updated;
      });
    },
    async login(body, ip, oldToken) {
      bodyObject(body);
      const email = emailAddress(body.email), password = validatePassword(body.password, false), now = Date.now();
      const buckets = [[tokenHash(`account:${ip}:${email}`), 5], [tokenHash(`ip:${ip}`), 30]];
      repo.transaction(() => {
        repo.cleanup(now);
        for (const [bucket, limit] of buckets) if ((repo.attempt(bucket)?.attempts || 0) >= limit)
          throw new AppError(429, "LOGIN_LIMIT", "Too many login attempts. Try again in 15 minutes.");
        for (const [bucket] of buckets) repo.addAttempt(bucket, now + 15 * 60 * 1000);
      });
      const credential = repo.credentials(email);
      const matches = await verifyPassword(password, credential?.passwordHash || await dummyHash());
      if (!matches || !credential?.active) throw badLogin();
      const token = randomBytes(32).toString("base64url");
      return repo.transaction(() => {
        const latest = repo.credentialById(credential.id);
        if (!latest?.active || latest.passwordHash !== credential.passwordHash) throw badLogin();
        if (oldToken) repo.removeSession(tokenHash(oldToken));
        repo.clearAttempt(buckets[0][0]);
        repo.createSession(tokenHash(token), latest.id, now + SESSION_MS);
        return { user: repo.user(latest.id), token };
      });
    },
    session: (token) => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? repo.session(tokenHash(token), Date.now()) : null,
    logout(token) { if (token) repo.removeSession(tokenHash(token)); },
    profile(actor, body) {
      bodyObject(body);
      if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "name")) invalid("Profile updates accept name only.");
      return repo.updateName(actor.id, text(body.name, "Name", 120));
    },
    async changePassword(actor, body) {
      bodyObject(body);
      const current = validatePassword(body.currentPassword, false), next = validatePassword(body.newPassword);
      const credential = repo.credentialById(actor.id);
      if (!await verifyPassword(current, credential.passwordHash)) throw new AppError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
      const passwordHash = await hashPassword(next);
      repo.transaction(() => {
        if (repo.credentialById(actor.id)?.passwordHash !== credential.passwordHash)
          throw new AppError(409, "PASSWORD_CHANGED", "Your password changed. Log in again.");
        repo.password(actor.id, passwordHash); repo.revokeUser(actor.id);
      });
      return { message: "Password changed. All sessions were signed out. Log in with your new password." };
    },
    async recover(email, password) {
      const address = emailAddress(email), passwordHash = await hashPassword(password);
      repo.transaction(() => {
        const credential = repo.credentials(address);
        if (!credential) throw new AppError(404, "NOT_FOUND", "Account not found.");
        repo.password(credential.id, passwordHash); repo.revokeUser(credential.id);
      });
    },
  };
}
