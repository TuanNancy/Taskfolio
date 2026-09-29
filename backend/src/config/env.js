import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  MONGO_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/.+/),
  JWT_SECRET: z.string().min(32).refine((value) => !/change.this|your.secret/i.test(value)),
  JWT_EXPIRES_IN: z.string().regex(/^[1-9]\d*[smhd]$/).default("7d"),
  COOKIE_MAX_AGE: z.coerce.number().int().positive().optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
});

export function loadConfig(source = process.env) {
  const env = envSchema.parse(source);
  const origin = new URL(env.FRONTEND_URL);
  if (origin.origin !== env.FRONTEND_URL || !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("FRONTEND_URL must be an HTTP(S) origin without a trailing slash or path");
  }
  const production = env.NODE_ENV === "production";
  if (production && origin.protocol !== "https:") throw new Error("Production requires an HTTPS frontend origin");
  if (env.COOKIE_SAME_SITE === "none" && !production) throw new Error("SameSite=None requires Secure cookies in production");
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  const sessionSeconds = Number(env.JWT_EXPIRES_IN.slice(0, -1)) * multipliers[env.JWT_EXPIRES_IN.at(-1)];
  if (!Number.isSafeInteger(sessionSeconds) || sessionSeconds > 30 * 86400) {
    throw new Error("JWT_EXPIRES_IN must be at most 30 days");
  }
  if (env.COOKIE_MAX_AGE !== undefined && env.COOKIE_MAX_AGE !== sessionSeconds * 1000) {
    throw new Error("Remove COOKIE_MAX_AGE or make it match JWT_EXPIRES_IN in milliseconds");
  }
  return Object.freeze({
    nodeEnv: env.NODE_ENV, port: env.PORT, mongoUri: env.MONGO_URI,
    jwtSecret: env.JWT_SECRET, sessionSeconds, trustProxyHops: env.TRUST_PROXY_HOPS,
    allowedOrigins: [env.FRONTEND_URL],
    cookie: Object.freeze({ httpOnly: true, secure: production, sameSite: env.COOKIE_SAME_SITE, path: "/", maxAge: sessionSeconds * 1000 }),
  });
}
