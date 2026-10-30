import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { invalid } from "./errors.js";

export const PASSWORD_COST = 12;
export function validatePassword(value, newPassword = true) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 72 || [...value].length < (newPassword ? 12 : 1) || (newPassword && !value.trim()))
    invalid(newPassword ? "Passwords must contain at least 12 characters and at most 72 UTF-8 bytes." : "Enter a valid password.");
  return value;
}
export const hashPassword = (value) => bcrypt.hash(validatePassword(value), PASSWORD_COST);
export const verifyPassword = (value, hash) => bcrypt.compare(value, hash);
let dummy;
export function dummyHash() {
  dummy ??= bcrypt.hash(randomBytes(32).toString("hex"), PASSWORD_COST);
  return dummy;
}
