import { invalid } from "./errors.js";
export function bodyObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid("Request body must be a JSON object.");
}
export function text(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    invalid(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
export function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min)
    invalid(`${name} must be an integer of at least ${min}.`);
  return value;
}
export function idParam(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
    invalid("ID must be a positive integer.");
  return integer(Number(value), "ID", 1);
}
export const statuses = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"];
