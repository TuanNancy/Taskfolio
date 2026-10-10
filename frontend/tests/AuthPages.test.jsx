import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ProtectedRoute from "@/components/ProtectedRoute";
import * as api from "@/services/api";

let auth;
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/services/api", () => ({ login: vi.fn(), register: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  auth = { user: null, loading: false, error: null, retry: vi.fn(), setUserFromAuth: vi.fn() };
});
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} />
  <Route path="/" element={<h1>Home</h1>} />
  <Route path="/private" element={<ProtectedRoute><h1>Private</h1></ProtectedRoute>} />
</Routes></MemoryRouter>);

async function fillRegistration(password = "strong-password", confirmation = password) {
  await userEvent.type(screen.getByLabelText("Tên người dùng"), "newuser");
  await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu", { exact: true }), password);
  await userEvent.type(screen.getByLabelText("Xác nhận mật khẩu"), confirmation);
}

describe("auth pages", () => {
  it("logs in and updates auth context", async () => {
    api.login.mockResolvedValue({ user: { username: "User" } });
    mount("/login");
    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(auth.setUserFromAuth).toHaveBeenCalledWith({ username: "User" });
  });

  it("shows a useful login failure", async () => {
    api.login.mockRejectedValue(new Error("Email hoặc mật khẩu không đúng"));
    mount("/login");
    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");
  });

  it("uses the session created by registration instead of asking for a second login", async () => {
    api.register.mockResolvedValue({ user: { username: "newuser" } });
    mount("/register");
    await fillRegistration();
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(auth.setUserFromAuth).toHaveBeenCalledWith({ username: "newuser" });
  });

  it("rejects mismatched confirmation before calling the API", async () => {
    mount("/register");
    await fillRegistration("password-one", "password-two");
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(api.register).not.toHaveBeenCalled();
    expect(screen.getByText("Mật khẩu xác nhận không khớp.")).toBeVisible();
    expect(screen.getByLabelText("Xác nhận mật khẩu")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows registration errors without discarding the entered fields", async () => {
    api.register.mockRejectedValue(new Error("Account exists"));
    mount("/register");
    await fillRegistration();
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Account exists");
    expect(screen.getByLabelText("Tên người dùng")).toHaveValue("newuser");
  });

  it("focuses the error summary and links errors to the invalid fields", async () => {
    mount("/register");
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(api.register).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveFocus();
    await userEvent.click(screen.getByRole("link", { name: "Email", exact: true }));
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Nhập địa chỉ email của bạn.");
  });

  it("connects server validation errors to fields", async () => {
    api.register.mockRejectedValue(Object.assign(new Error("Validation error"), { fields: [{ field: "email", message: "Email chưa hợp lệ" }] }));
    mount("/register");
    await fillRegistration();
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(await screen.findByText("Email chưa hợp lệ")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Email chưa hợp lệ");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("reveals and hides the same password input without discarding its value", async () => {
    mount("/login");
    const input = screen.getByLabelText("Mật khẩu", { exact: true });
    await userEvent.type(input, "my-password");
    await userEvent.click(screen.getByRole("button", { name: "Hiện mật khẩu", exact: true }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("my-password");
    await userEvent.click(screen.getByRole("button", { name: "Ẩn mật khẩu", exact: true }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("applies the UTF-8 password limit before submitting registration", async () => {
    mount("/register");
    await fillRegistration("ậ".repeat(25), "ậ".repeat(25));
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(api.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mật khẩu", { exact: true })).toHaveAttribute("aria-invalid", "true");
  });

  it.each(["/login", "/register", "/private"])("waits for initialization on %s", (path) => {
    auth.loading = true;
    mount(path);
    expect(screen.getByRole("status")).toHaveTextContent("Đang kiểm tra");
  });

  it.each(["/login", "/register"])("redirects authenticated visitors from %s", async (path) => {
    auth.user = { username: "User" };
    mount(path);
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("retries unavailable sessions and guards anonymous routes", async () => {
    auth.error = "Temporarily unavailable";
    const view = mount("/private");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(auth.retry).toHaveBeenCalledOnce();
    view.unmount();
    auth.error = null;
    mount("/private");
    expect(await screen.findByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
  });

  it("shows protected content for a valid session", () => {
    auth.user = { username: "User" };
    mount("/private");
    expect(screen.getByText("Private")).toBeInTheDocument();
  });
});
