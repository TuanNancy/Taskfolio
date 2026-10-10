import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskItem from "@/components/TaskItem";
import Pagination from "@/components/Pagination";

const task = { _id: "a", title: "Task", status: "active", createdAt: new Date(2026, 0, 1, 23, 55).toISOString() };
afterEach(() => vi.useRealTimers());

it("labels yesterday correctly just after midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 2, 0, 5));
  render(<TaskItem task={task} />);
  expect(screen.getByText(/Tạo: Hôm qua/)).toBeInTheDocument();
});

it("exposes task actions and disables conflicting writes while pending", async () => {
  const onToggle = vi.fn();
  const onStartEdit = vi.fn();
  const onDelete = vi.fn();
  const view = render(<TaskItem task={task} onToggle={onToggle} onStartEdit={onStartEdit} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: "Hoàn thành: Task" }));
  await userEvent.click(screen.getByRole("button", { name: "Sửa: Task" }));
  await userEvent.click(screen.getByRole("button", { name: "Xóa: Task" }));
  expect(onToggle).toHaveBeenCalledWith("a");
  expect(onStartEdit).toHaveBeenCalledWith(task);
  expect(onDelete).toHaveBeenCalledWith("a");
  view.rerender(<TaskItem task={{ ...task, status: "completed", completedAt: new Date().toISOString() }} pending />);
  expect(screen.getByRole("button", { name: "Mở lại: Task" })).toHaveAttribute("aria-pressed", "true");
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
});

it("supports saving with Enter and cancelling with Escape", async () => {
  const save = vi.fn();
  const cancel = vi.fn();
  render(<TaskItem task={task} editingId="a" editingTitle="Edit" onSaveEdit={save} onCancelEdit={cancel} onEditTitleChange={vi.fn()} />);
  await userEvent.type(screen.getByRole("textbox", { name: "Sửa tiêu đề" }), "x{Enter}{Escape}");
  expect(save).toHaveBeenCalledWith("a");
  expect(cancel).toHaveBeenCalled();
});

it("keeps pagination bounded for a large number of pages", async () => {
  const change = vi.fn();
  render(<Pagination currentPage={500} totalPages={1000} totalTasks={5000} onPageChange={change} />);
  expect(screen.getAllByRole("button")).toHaveLength(7);
  expect(screen.getByRole("button", { name: "500", exact: true })).toHaveAttribute("aria-current", "page");
  await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
  expect(change).toHaveBeenCalledWith(501);
});
