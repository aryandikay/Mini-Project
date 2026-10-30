import { createInterface } from "node:readline/promises";
import { openDatabase } from "../server/src/db/connection.js";
import { authRepository } from "../server/src/repositories/auth.js";
import { authService } from "../server/src/services/auth.js";

function hiddenPassword() {
  if (!process.stdin.isTTY) throw new Error("Use an interactive terminal, or --stdin with protected JSON input.");
  process.stdout.write("Password (12+ characters, hidden): ");
  process.stdin.setRawMode(true); process.stdin.setEncoding("utf8"); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const done = () => { process.stdin.off("data", read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); };
    const read = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") { done(); reject(new Error("Account operation cancelled.")); return; }
        if (char === "\r" || char === "\n") { done(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") { value = [...value].slice(0, -1).join(""); }
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", read);
  });
}
const operation = process.argv[2];
if (!["bootstrap", "recover"].includes(operation)) throw new Error("Use admin:bootstrap or admin:recover.");
let input;
if (process.argv[3] === "--stdin") {
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 4096) throw new Error("Account input is too large.");
  }
  try { input = JSON.parse(value); } catch { throw new Error("Invalid account JSON input."); }
} else {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  input = {};
  if (operation === "bootstrap") input.name = await terminal.question("Administrator display name: ");
  input.email = await terminal.question("Account email: ");
  terminal.close();
  input.password = await hiddenPassword();
}
const db = openDatabase();
try {
  const service = authService(authRepository(db));
  if (operation === "bootstrap") await service.bootstrap(input);
  else await service.recover(input.email, input.password);
  console.log(operation === "bootstrap" ? "Administrator created. Log in using the account you supplied." : "Password reset. Existing sessions have been revoked.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
