import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodoApp from "@/components/TodoApp";
import * as api from "@/services/api";
import { queryWrapper } from "./helpers";

vi.mock("@/services/api", () => ({ getAllTasks: vi.fn(), getTaskCounts: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { username: "Tester" }, logout: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let task;
beforeEach(() => {
  vi.resetAllMocks();
  task = { _id: "a", title: "Đọc sách", status: "active", createdAt: "2026-01-01T08:00:00Z" };
  api.getAllTasks.mockImplementation(async (page, limit, filter) => {
    const tasks = task && (filter === "all" || task.status === filter) ? [{ ...task }] : [];
    return { tasks, pagination: { currentPage: page, totalPages: tasks.length ? 1 : 0, totalTasks: tasks.length } };
  });
  api.getTaskCounts.mockImplementation(async () => ({ total: task ? 1 : 0, active: task?.status === "active" ? 1 : 0, completed: task?.status === "completed" ? 1 : 0 }));
  api.updateTask.mockImplementation(async (id, changes) => { task = { ...task, ...changes }; return task; });
  api.deleteTask.mockImplementation(async () => { task = null; });
});

it("edits a real task row, retains failed drafts, and restores focus after saving", async () => {
  const user = userEvent.setup();
  render(<TodoApp />, { wrapper: queryWrapper() });
  await user.click(await screen.findByRole("button", { name: "Sửa: Đọc sách" }));
  const input = screen.getByRole("textbox", { name: "Sửa tiêu đề" });
  expect(input).toHaveFocus();
  await user.clear(input);
  await user.keyboard("{Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent("Tiêu đề không được để trống");
  expect(api.updateTask).not.toHaveBeenCalled();

  await user.type(input, "Đọc một chương");
  api.updateTask.mockRejectedValueOnce(new Error("Kết nối bị gián đoạn"));
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Kết nối bị gián đoạn");
  expect(input).toHaveValue("Đọc một chương");
  await waitFor(() => expect(screen.getByRole("button", { name: "Lưu chỉnh sửa" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Lưu chỉnh sửa" }));
  expect(await screen.findByText("Đọc một chương")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Sửa: Đọc một chương" })).toHaveFocus());
});

it("returns focus to the list when completing a task removes the focused row", async () => {
  const user = userEvent.setup();
  render(<TodoApp />, { wrapper: queryWrapper() });
  await screen.findByText("Đọc sách");
  await user.click(screen.getByRole("button", { name: /Đang làm \(/ }));
  await user.click(await screen.findByRole("button", { name: "Hoàn thành: Đọc sách" }));
  await screen.findByText("Bạn đã có một khoảng thảnh thơi");
  await waitFor(() => expect(screen.getByRole("heading", { name: "Công việc đang làm" })).toHaveFocus());
});

it("cancels edits using Escape and can delete with the real row controls", async () => {
  const user = userEvent.setup();
  render(<TodoApp />, { wrapper: queryWrapper() });
  await user.click(await screen.findByRole("button", { name: "Sửa: Đọc sách" }));
  await user.keyboard("changed{Escape}");
  expect(screen.getByRole("button", { name: "Sửa: Đọc sách" })).toHaveFocus();
  expect(api.updateTask).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Xóa: Đọc sách" }));
  expect(await screen.findByText("Một khởi đầu gọn gàng")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Thêm một công việc" }));
  expect(screen.getByRole("textbox", { name: "Công việc mới" })).toHaveFocus();
});
