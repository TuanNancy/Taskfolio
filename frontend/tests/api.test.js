import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { advanceSession, onSessionExpired, login, register, logout, getMe, getAllTasks, getTaskCounts, createTask, updateTask, deleteTask } from "@/services/api";
import { deferred } from "./helpers";

const originalAdapter = api.defaults.adapter;
let unsubscribe;
beforeEach(() => advanceSession());
afterEach(() => { api.defaults.adapter = originalAdapter; unsubscribe?.(); });

const fail = (config, status, data) => new axios.AxiosError("HTTP failure", "ERR_BAD_RESPONSE", config, null, { status, data, config });

describe("API transport", () => {
  it("preserves status and server validation errors for both auth and tasks", async () => {
    api.defaults.adapter = async (config) => { throw fail(config, 400, { code: "VALIDATION_ERROR", message: "Invalid", fields: [{ field: "title", message: "Title required" }] }); };
    await expect(createTask("")).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", message: "Title required" });
    await expect(login({})).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("emits session expiry only for current protected requests", async () => {
    const listener = vi.fn();
    unsubscribe = onSessionExpired(listener);
    api.defaults.adapter = async (config) => { throw fail(config, 401, { message: "Unauthorized" }); };
    await expect(login({})).rejects.toThrow("Unauthorized");
    expect(listener).not.toHaveBeenCalled();
    await expect(getAllTasks()).rejects.toThrow("Unauthorized");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("ignores a 401 from the previous session", async () => {
    const response = deferred();
    const listener = vi.fn();
    unsubscribe = onSessionExpired(listener);
    let sentConfig;
    api.defaults.adapter = (config) => { sentConfig = config; return response.promise; };
    const result = getAllTasks().catch((error) => error);
    await vi.waitFor(() => expect(sentConfig).toBeDefined());
    advanceSession();
    response.reject(fail(sentConfig, 401, { message: "Expired" }));
    expect((await result).status).toBe(401);
    expect(listener).not.toHaveBeenCalled();
  });

  it("sends the CSRF header and keeps PATCH payloads free of client timestamps", async () => {
    const requests = [];
    api.defaults.adapter = async (config) => { requests.push(config); return { status: 200, data: { ok: true }, config }; };
    await register({ username: "User" });
    await login({ email: "user@example.com" });
    await logout();
    await getMe();
    await getAllTasks(2, 5, "completed");
    await getTaskCounts();
    await createTask("Title");
    await updateTask("id", { status: "completed" });
    await deleteTask("id");
    for (const config of requests) expect(config.headers.get("X-Requested-With")).toBe("TodoTasks");
    expect(requests[4].params).toEqual({ page: 2, limit: 5, status: "completed" });
    expect(requests[7].method).toBe("patch");
    expect(JSON.parse(requests[7].data)).toEqual({ status: "completed" });
  });

  it("keeps cancellation recognizable and reports network errors without invalidating auth", async () => {
    api.defaults.adapter = async () => { throw new axios.CanceledError(); };
    await expect(getAllTasks()).rejects.toMatchObject({ code: "ERR_CANCELED" });
    api.defaults.adapter = async () => { throw new Error("Network"); };
    await expect(getAllTasks()).rejects.toMatchObject({ status: undefined, message: expect.stringContaining("Không thể kết nối") });
  });
});
