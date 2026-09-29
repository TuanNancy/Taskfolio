import { describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

const env = {
  NODE_ENV: "test", MONGO_URI: "mongodb://127.0.0.1/test",
  JWT_SECRET: "test-only-signing-secret-with-at-least-32-characters",
  FRONTEND_URL: "http://localhost:5173",
};
afterEach(() => vi.restoreAllMocks());

describe("configuration", () => {
  it.each([
    { JWT_SECRET: "short" }, { MONGO_URI: "" }, { JWT_EXPIRES_IN: "never" },
    { PORT: "-1" }, { COOKIE_MAX_AGE: "123" }, { FRONTEND_URL: "https://app.example/path" },
    { NODE_ENV: "production", FRONTEND_URL: "http://app.example" },
    { COOKIE_SAME_SITE: "none" },
  ])("fails at startup for invalid settings: %j", (overrides) => {
    expect(() => loadConfig({ ...env, ...overrides })).toThrow();
  });

  it("derives cookie lifetime from token lifetime", () => {
    const config = loadConfig({ ...env, JWT_EXPIRES_IN: "1h" });
    expect(config.sessionSeconds).toBe(3600);
    expect(config.cookie.maxAge).toBe(3600000);
    expect(config.cookie.sameSite).toBe("lax");
  });
});

describe("HTTP boundaries", () => {
  const makeApp = () => createApp(loadConfig(env));

  it("has separate live and ready probes", async () => {
    const app = makeApp();
    expect((await request(app).get("/health/live")).status).toBe(200);
    expect((await request(app).get("/health/ready")).status).toBe(503);
  });

  it("returns JSON for unknown routes, with a correlation ID", async () => {
    const response = await request(makeApp()).get("/api/not-found");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("rejects unsafe requests without the explicit AJAX header", async () => {
    expect((await request(makeApp()).post("/api/auth/logout")).status).toBe(403);
  });

  it("rejects untrusted origins even with the AJAX header", async () => {
    const response = await request(makeApp()).post("/api/auth/logout")
      .set("Origin", "https://untrusted.example").set("X-Requested-With", "TodoTasks");
    expect(response.status).toBe(403);
  });

  it("clears the cookie with matching secure attributes in production", async () => {
    const app = createApp(loadConfig({ ...env, NODE_ENV: "production", FRONTEND_URL: "https://todo.example" }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await request(app).post("/api/auth/logout")
      .set("Origin", "https://todo.example").set("X-Requested-With", "TodoTasks");
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
  });

  it("returns safe JSON errors for malformed JSON and large bodies", async () => {
    const app = makeApp();
    const malformed = await request(app).post("/api/auth/login")
      .set("X-Requested-With", "TodoTasks").set("Content-Type", "application/json").send('{"password":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_JSON");
    const large = await request(app).post("/api/auth/login")
      .set("X-Requested-With", "TodoTasks").send({ value: "x".repeat(20000) });
    expect(large.status).toBe(413);
  });

  it("rate limits repeated authentication attempts", async () => {
    const app = makeApp();
    let response;
    for (let attempt = 0; attempt < 21; attempt++) {
      response = await request(app).post("/api/auth/login").set("X-Requested-With", "TodoTasks").send({});
    }
    expect(response.status).toBe(429);
    expect(response.body.code).toBe("RATE_LIMITED");
  });
});
