import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import { deferred, queryWrapper } from "./helpers";

vi.mock("@/services/api", () => ({ getMe: vi.fn(), logout: vi.fn(), advanceSession: vi.fn(), onSessionExpired: vi.fn(() => () => {}) }));

function Probe() {
  const { user, loading, error, setUserFromAuth, logout, retry } = useAuth();
  return <div><span>{loading ? "Loading" : user?.username || "Guest"}</span><span>{error}</span>
    <button onClick={() => setUserFromAuth({ username: "New user" })}>Login</button>
    <button onClick={() => logout().catch(() => {})}>Logout</button>
    <button onClick={retry}>Retry</button>
  </div>;
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>, { wrapper: queryWrapper() });
beforeEach(() => vi.clearAllMocks());

describe("session state", () => {
  it("ignores bootstrap responses that arrive after a new login", async () => {
    const bootstrap = deferred();
    api.getMe.mockReturnValue(bootstrap.promise);
    mount();
    await userEvent.click(screen.getByText("Login"));
    await act(async () => bootstrap.reject(Object.assign(new Error("Unauthorized"), { status: 401 })));
    expect(screen.getByText("New user")).toBeInTheDocument();
  });

  it("keeps the session visible if server logout fails", async () => {
    api.getMe.mockResolvedValue({ user: { username: "Current user" } });
    api.logout.mockRejectedValue(new Error("Offline"));
    mount();
    await screen.findByText("Current user");
    await userEvent.click(screen.getByText("Logout"));
    await waitFor(() => expect(api.logout).toHaveBeenCalled());
    expect(screen.getByText("Current user")).toBeInTheDocument();
  });

  it("offers retry for an unavailable auth service", async () => {
    api.getMe.mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValueOnce({ user: { username: "Recovered" } });
    mount();
    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Retry"));
    expect(await screen.findByText("Recovered")).toBeInTheDocument();
  });

  it("clears the session after successful logout", async () => {
    api.getMe.mockResolvedValue({ user: { username: "Current user" } });
    api.logout.mockResolvedValue({});
    mount();
    await screen.findByText("Current user");
    await userEvent.click(screen.getByText("Logout"));
    expect(await screen.findByText("Guest")).toBeInTheDocument();
  });

  it("clears a session when the API reports expiry", async () => {
    api.getMe.mockResolvedValue({ user: { username: "Current user" } });
    mount();
    await screen.findByText("Current user");
    act(() => api.onSessionExpired.mock.calls.at(-1)[0]());
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("treats an initial 401 as anonymous rather than unavailable", async () => {
    api.getMe.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    mount();
    expect(await screen.findByText("Guest")).toBeInTheDocument();
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
  });
});
