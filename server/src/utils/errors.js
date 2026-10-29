export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function invalid(message) {
  throw new AppError(400, "VALIDATION_ERROR", message);
}
