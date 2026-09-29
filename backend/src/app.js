import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import mongoose from "mongoose";
import taskRoutes from "./routes/tasksRouters.js";
import authRoutes from "./routes/authRoutes.js";
import { errorHandler, HttpError } from "./middleware/errorHandler.js";

export function createApp(config) {
  const app = express();
  app.locals.config = config;
  app.set("trust proxy", config.trustProxyHops);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set("X-Request-ID", req.id);
    res.set("Cache-Control", "no-store");
    const start = performance.now();
    res.on("finish", () => {
      if (config.nodeEnv !== "test") console.info(JSON.stringify({
        event: "request", requestId: req.id, method: req.method,
        status: res.statusCode, durationMs: Math.round(performance.now() - start),
      }));
    });
    next();
  });
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      callback(new HttpError(403, "ORIGIN_NOT_ALLOWED", "Origin không được phép"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With"],
  }));
  app.use("/api", (req, res, next) => {
    // This non-simple header forces cross-origin browsers to pass CORS preflight.
    // Requiring it on every mutation also covers logout and requests without Origin.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("X-Requested-With") !== "TodoTasks") {
      return next(new HttpError(403, "CSRF_REJECTED", "Request thiếu header bảo vệ CSRF"));
    }
    next();
  });
  app.use(express.json({ limit: "16kb" }), cookieParser());

  app.get("/health/live", (req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", (req, res) => {
    const ready = mongoose.connection.readyState === 1 && !app.locals.shuttingDown;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
  });

  const limiter = (limit, windowMs) => rateLimit({
    windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, "RATE_LIMITED", "Quá nhiều yêu cầu. Vui lòng thử lại sau.")),
  });
  // In-memory limits suit one instance. Multiple replicas need a shared store.
  app.use("/api", limiter(300, 60_000));
  app.use(["/api/auth/login", "/api/auth/register"], limiter(20, 15 * 60_000));
  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use((req, res, next) => next(new HttpError(404, "NOT_FOUND", "Đường dẫn không tồn tại")));
  app.use(errorHandler);
  return app;
}
