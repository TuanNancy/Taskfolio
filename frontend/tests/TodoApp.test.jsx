import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodoApp from "@/components/TodoApp";
import * as api from "@/services/api";
import { queryWrapper, deferred } from "./helpers";

vi.mock("@/services/api", () => ({ getAllTasks: vi.fn(), getTaskCounts: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { username: "Tester" }, logout: vi.fn() }) }));
vi.mock("@/components/ui/animated-shader-background", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Presentation is independent of the list/mutation orchestration tested here.
vi.mock("@/components/TaskItem", () => ({ default: ({ task, onToggle, onDelete, pending }) => (
  <div><span>{task.title}</span><span data-testid={`status-${task._id}`}>{task.status}</span>
    <button disabled={pending} onClick={() => onToggle(task._id)}>Toggle {task.title}</button>
    <button disabled={pending} onClick={() => onDelete(task._id)}>Delete {task.title}</button>
  </div>
) }));

let tasks;
beforeEach(() => {
  vi.resetAllMocks();
  tasks = [{ _id: "a", title: "Alpha", status: "active" }, { _id: "b", title: "Beta", status: "active" }];
  api.getAllTasks.mockImplementation(async (page, limit, filter) => {
    const selected = tasks.filter((task) => filter === "all" || task.status === filter);
    return { tasks: selected.slice((page - 1) * limit, page * limit).map((task) => ({ ...task })), pagination: {
      currentPage: page, totalPages: Math.ceil(selected.length / limit), totalTasks: selected.length,
    } };
  });
  api.getTaskCounts.mockImplementation(async () => ({ total: tasks.length, active: tasks.filter((t) => t.status === "active").length, completed: tasks.filter((t) => t.status === "completed").length }));
  api.updateTask.mockImplementation(async (id, changes) => {
    tasks = tasks.map((task) => task._id === id ? { ...task, ...changes } : task);
    return tasks.find((task) => task._id === id);
  });
  api.deleteTask.mockImplementation(async (id) => { tasks = tasks.filter((task) => task._id !== id); });
});

const mount = () => render(<TodoApp />, { wrapper: queryWrapper() });

describe("task user journeys", () => {
  it("preserves the draft when creation fails", async () => {
    api.createTask.mockRejectedValue(new Error("Offline"));
    mount();
    const input = await screen.findByPlaceholderText("Nhập công việc mới...");
    await userEvent.type(input, "Do not lose this{Enter}");
    await waitFor(() => expect(api.createTask).toHaveBeenCalled());
    expect(input).toHaveValue("Do not lose this");
  });

  it("clears the draft only after a successful creation", async () => {
    api.createTask.mockImplementation(async (title) => { const task = { _id: "new", title, status: "active" }; tasks.unshift(task); return task; });
    mount();
    const input = await screen.findByPlaceholderText("Nhập công việc mới...");
    await userEvent.type(input, "New task{Enter}");
    await screen.findByText("New task");
    expect(screen.getByPlaceholderText("Nhập công việc mới...")).toHaveValue("");
  });

  it("removes completed tasks from the active filter", async () => {
    mount();
    await screen.findByText("Alpha");
    await userEvent.click(screen.getByRole("button", { name: /Đang làm \(/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Toggle Alpha" }));
    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument());
    expect(await screen.findByText("Beta")).toBeInTheDocument();
  });

  it("returns to a valid page after deleting the last row on page two", async () => {
    tasks = Array.from({ length: 6 }, (_, i) => ({ _id: `${i}`, title: `Task ${i}`, status: "active" }));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "2", exact: true }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete Task 5" }));
    expect(await screen.findByText("Task 0")).toBeInTheDocument();
    expect(screen.queryByText("Task 5")).not.toBeInTheDocument();
  });

  it("does not roll back Beta when Alpha fails later", async () => {
    const alpha = deferred();
    const originalUpdate = api.updateTask.getMockImplementation();
    api.updateTask.mockImplementation((id, changes) => id === "a" ? alpha.promise : originalUpdate(id, changes));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Toggle Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Toggle Beta" }));
    await waitFor(() => expect(screen.getByTestId("status-b")).toHaveTextContent("completed"));
    await act(async () => alpha.reject(new Error("Alpha failed")));
    await waitFor(() => expect(screen.getByTestId("status-a")).toHaveTextContent("active"));
    expect(screen.getByTestId("status-b")).toHaveTextContent("completed");
  });

  it("keeps the form available while loading a filter and ignores the older response", async () => {
    const old = deferred();
    const originalGet = api.getAllTasks.getMockImplementation();
    api.getAllTasks.mockImplementation((page, limit, filter) => filter === "active" ? old.promise : originalGet(page, limit, filter));
    mount();
    await screen.findByText("Alpha");
    await userEvent.type(screen.getByPlaceholderText("Nhập công việc mới..."), "Draft");
    fireEvent.click(screen.getByRole("button", { name: /Đang làm \(/ }));
    expect(screen.getByPlaceholderText("Nhập công việc mới...")).toHaveValue("Draft");
    fireEvent.click(screen.getByRole("button", { name: /Tất cả \(/ }));
    await act(async () => old.resolve({ tasks: [{ _id: "old", title: "Old result", status: "active" }], pagination: { currentPage: 1, totalPages: 1, totalTasks: 1 } }));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
  });
});
