import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
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
  await userEvent.type(screen.getByLabelText("Username"), "newuser");
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
    expect(toast.error).toHaveBeenCalledWith("Email hoặc mật khẩu không đúng");
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
    expect(toast.error).toHaveBeenCalledWith("Mật khẩu xác nhận không khớp");
  });

  it("shows registration errors without discarding the entered fields", async () => {
    api.register.mockRejectedValue(new Error("Account exists"));
    mount("/register");
    await fillRegistration();
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(toast.error).toHaveBeenCalledWith("Account exists");
    expect(screen.getByLabelText("Username")).toHaveValue("newuser");
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
