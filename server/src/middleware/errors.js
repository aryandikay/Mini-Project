import { AppError } from "../utils/errors.js";
export function notFound(req, res, next) {
  next(new AppError(404, "NOT_FOUND", "Endpoint not found."));
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed")
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON.",
      },
    });
  if (error.type === "entity.too.large")
    return res.status(413).json({
      error: {
        code: "BODY_TOO_LARGE",
        message: "Request body is too large.",
      },
    });
  if (error instanceof AppError)
    return res
      .status(error.status)
      .json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
  console.error("Unexpected API failure:", error);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "The request could not be completed. Please try again.",
    },
  });
}
