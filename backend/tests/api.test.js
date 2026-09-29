import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import connectDB from "../src/config/db.js";

const secret = "test-only-signing-secret-with-at-least-32-characters";
const app = createApp(loadConfig({ NODE_ENV: "test", MONGO_URI: "mongodb://127.0.0.1/test", JWT_SECRET: secret }));
let database;
let owner;
let other;
let cookie;
let otherCookie;

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  database = await MongoMemoryServer.create();
  await connectDB(database.getUri());
  [owner, other] = await User.create([
    { username: "owner", email: "owner@example.com", password: "test-password-123" },
    { username: "other", email: "other@example.com", password: "test-password-123" },
  ]);
  await Promise.all([User.init(), Task.init()]);
  cookie = `token=${jwt.sign({ userId: owner.id }, secret)}`;
  otherCookie = `token=${jwt.sign({ userId: other.id }, secret)}`;
});

beforeEach(async () => {
  await Task.deleteMany({});
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  vi.restoreAllMocks();
  await mongoose.disconnect();
  await database?.stop();
});

const create = (body) => request(app).post("/api/tasks").set("X-Requested-With", "TodoTasks").set("Cookie", cookie).send(body);
const update = (id, body) => request(app).put(`/api/tasks/${id}`).set("X-Requested-With", "TodoTasks").set("Cookie", cookie).send(body);

describe("task data contract", () => {
  it("creates a trimmed, active task with no completion date", async () => {
    const response = await create({ title: "  Learn API testing  " });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title: "Learn API testing", status: "active", completedAt: null, userId: owner.id });
  });

  it.each([42, [], {}, null, " ", "x".repeat(201)].map((value) => [value]))("rejects an invalid title: %j", async (title) => {
    expect((await create({ title })).status).toBe(400);
    expect(await Task.countDocuments()).toBe(0);
  });

  it.each([{ title: " " }, { title: null }, { status: "unknown" }, {}, { userId: "someone-else" }])("rejects invalid updates: %j", async (body) => {
    const task = await Task.create({ title: "Original", userId: owner.id });
    expect((await update(task.id, body)).status).toBe(400);
    expect((await Task.findById(task.id)).title).toBe("Original");
  });

  it("owns the completion time and clears it when reopening", async () => {
    const task = await Task.create({ title: "Original", userId: owner.id });
    const before = Date.now();
    const completed = await update(task.id, { status: "completed" });
    expect(completed.status).toBe(200);
    expect(new Date(completed.body.completedAt).getTime()).toBeGreaterThanOrEqual(before);
    const edited = await update(task.id, { title: "Renamed" });
    expect(edited.body.completedAt).toBe(completed.body.completedAt);
    const reopened = await update(task.id, { status: "active" });
    expect(reopened.body.completedAt).toBeNull();
  });

  it("rejects a client-supplied completion date", async () => {
    const task = await Task.create({ title: "Original", userId: owner.id });
    expect((await update(task.id, { status: "completed", completedAt: "2000-01-01" })).status).toBe(400);
  });

  it.each(["page=-1", "page=0", "page=1abc", "page=1.5", "page=9007199254740991", "limit=0", "limit=101", "status=invalid"]) (
    "rejects invalid pagination/filter: %s", async (query) => {
      expect((await request(app).get(`/api/tasks?${query}`).set("Cookie", cookie)).status).toBe(400);
    },
  );
});

describe("task ownership", () => {
  it("does not allow anonymous access", async () => {
    expect((await request(app).get("/api/tasks")).status).toBe(401);
  });

  it("scopes lists, counts, updates and deletes to the signed-in user", async () => {
    const task = await Task.create({ title: "Private", userId: owner.id });
    const list = await request(app).get("/api/tasks").set("Cookie", otherCookie);
    expect(list.body.tasks).toEqual([]);
    const counts = await request(app).get("/api/tasks/counts").set("Cookie", otherCookie);
    expect(counts.body).toEqual({ total: 0, active: 0, completed: 0 });
    expect((await request(app).put(`/api/tasks/${task.id}`).set("X-Requested-With", "TodoTasks").set("Cookie", otherCookie).send({ title: "Stolen" })).status).toBe(404);
    expect((await request(app).delete(`/api/tasks/${task.id}`).set("X-Requested-With", "TodoTasks").set("Cookie", otherCookie)).status).toBe(404);
    expect((await Task.findById(task.id)).title).toBe("Private");
  });

  it("paginates deterministically, filters, counts, and deletes owned tasks", async () => {
    const date = new Date();
    const tasks = await Task.insertMany(Array.from({ length: 6 }, (_, index) => ({
      title: `Task ${index}`, userId: owner.id, createdAt: date,
      status: index === 5 ? "completed" : "active",
    })));
    const list = await request(app).get("/api/tasks?page=1&limit=2&status=active").set("Cookie", cookie);
    expect(list.body.tasks.map((task) => task._id)).toEqual([tasks[4].id, tasks[3].id]);
    expect(list.body.pagination).toMatchObject({ totalTasks: 5, totalPages: 3, hasNext: true, hasPrev: false });
    expect((await request(app).get("/api/tasks/counts").set("Cookie", cookie)).body).toEqual({ total: 6, active: 5, completed: 1 });
    expect((await request(app).delete(`/api/tasks/${tasks[0].id}`).set("X-Requested-With", "TodoTasks").set("Cookie", cookie)).status).toBe(200);
    expect(await Task.findById(tasks[0].id)).toBeNull();
    expect((await update("bad-id", { title: "new" })).status).toBe(400);
    expect((await request(app).get("/health/ready")).status).toBe(200);
  });
});

describe("auth validation", () => {
  it("registers, normalizes email, hashes passwords, logs in, reads the session and logs out", async () => {
    const agent = request.agent(app);
    const data = { username: "newuser", email: " NEW@EXAMPLE.COM ", password: "new-password-123" };
    const registration = await agent.post("/api/auth/register").set("X-Requested-With", "TodoTasks").send(data);
    expect(registration.status).toBe(201);
    expect(registration.body.user.email).toBe("new@example.com");
    expect(registration.body.user).not.toHaveProperty("password");
    const stored = await User.findOne({ email: "new@example.com" }).select("+password");
    expect(stored.password).not.toBe(data.password);
    expect(await stored.comparePassword(data.password)).toBe(true);
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.id).toBe(registration.body.user.id);
    expect((await agent.post("/api/auth/logout").set("X-Requested-With", "TodoTasks")).status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    const login = await agent.post("/api/auth/login").set("X-Requested-With", "TodoTasks").send({ email: data.email, password: data.password });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"][0]).toContain("HttpOnly");
    expect((await agent.post("/api/auth/register").set("X-Requested-With", "TodoTasks").send(data)).status).toBe(409);
  });

  it.each(["missing@example.com", "owner@example.com"])("rejects bad credentials for %s", async (email) => {
    const response = await request(app).post("/api/auth/login").set("X-Requested-With", "TodoTasks").send({ email, password: "wrong-password" });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects expired, malformed and deleted-user sessions", async () => {
    const tokens = [
      "invalid", jwt.sign({ userId: owner.id }, secret, { expiresIn: -1 }),
      jwt.sign({ userId: "not-an-id" }, secret),
      jwt.sign({ userId: new mongoose.Types.ObjectId().toString() }, secret),
    ];
    for (const token of tokens) {
      expect((await request(app).get("/api/auth/me").set("Cookie", `token=${token}`)).status).toBe(401);
    }
  });

  it.each([{ $ne: null }, ["owner@example.com"], 42].map((value) => [value]))("rejects non-string identity fields: %j", async (email) => {
    expect((await request(app).post("/api/auth/login").set("X-Requested-With", "TodoTasks").send({ email, password: "test-password-123" })).status).toBe(400);
  });

  it("returns a client error without logging a rejected password", async () => {
    const response = await request(app).post("/api/auth/register").set("X-Requested-With", "TodoTasks").send({ username: "shortpass", email: "short@example.com", password: "tiny" });
    expect(response.status).toBe(400);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not misclassify a database outage as an invalid session", async () => {
    vi.spyOn(User, "findById").mockReturnValue({ select: () => {
      const error = new Error("internal connection details");
      error.name = "MongoNetworkError";
      throw error;
    } });
    const response = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("internal connection details");
  });
});
