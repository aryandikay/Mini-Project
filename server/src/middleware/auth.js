import { authRepository } from "../repositories/auth.js";
import { authService, SESSION_MS } from "../services/auth.js";
import { AppError } from "../utils/errors.js";
import { authControllers } from "../controllers/auth.js";
import { authRoutes } from "../routes/auth.js";

export const COOKIE_NAME = "eventsync_session";
export function authMiddleware(db, options = {}) {
  const service = authService(authRepository(db));
  const origin = new URL(options.origin || process.env.APP_ORIGIN || "http://localhost:5173").origin;
  const secure = options.secureCookies ?? (process.env.NODE_ENV === "production");
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) throw new Error("Production APP_ORIGIN must use HTTPS.");
  const cookieOptions = { httpOnly: true, sameSite: "strict", secure, path: "/" };
  function token(req) {
    const matches = (req.headers.cookie || "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE_NAME}=`));
    return matches.length === 1 ? matches[0].slice(COOKIE_NAME.length + 1) : undefined;
  }
  const resolve = (req, res, next) => { req.sessionToken = token(req); req.user = service.session(req.sessionToken); next(); };
  const requireUser = (req, res, next) => req.user ? next() : next(new AppError(401, "AUTH_REQUIRED", "Log in to continue."));
  const requireAdmin = (req, res, next) => req.user?.role === "ADMIN" ? next() : next(new AppError(403, "FORBIDDEN", "Administrator access is required."));
  function protectOrigin(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const supplied = req.get("origin");
    const sameHost = `${req.protocol}://${req.get("host")}`;
    if (!supplied || (supplied !== origin && supplied !== sameHost))
      return next(new AppError(403, "ORIGIN_REJECTED", "Request origin is not allowed."));
    next();
  }
  const router = authRoutes(authControllers(service, { name: COOKIE_NAME, options: cookieOptions, ttl: SESSION_MS }), requireUser, requireAdmin);
  return { resolve, protectOrigin, requireUser, router };
}
