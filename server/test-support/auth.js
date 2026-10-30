import { randomBytes } from "node:crypto";
import { authService } from "../src/services/auth.js";
import { authRepository } from "../src/repositories/auth.js";
export const TEST_ORIGIN = "http://localhost:5173";
const account = { name: "Isolated organizer", email: "organizer@tests.invalid", password: randomBytes(24).toString("base64url") };
export async function authenticatedHeaders(db, base) {
  const repo = authRepository(db);
  if (!repo.userCount()) await authService(repo).bootstrap(account);
  const response = await fetch(`${base}/api/auth/login`, { method: "POST",
    headers: { "Content-Type": "application/json", Origin: TEST_ORIGIN }, body: JSON.stringify({ email: account.email, password: account.password }) });
  if (!response.ok) throw new Error(`Fixture login failed: ${response.status}`);
  return { "Content-Type": "application/json", Origin: TEST_ORIGIN, Cookie: response.headers.get("set-cookie").split(";")[0] };
}
