import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json", "X-Requested-With": "TodoTasks" },
  timeout: 10000,
  withCredentials: true,
});

let sessionVersion = 0;
const expiredListeners = new Set();
export const advanceSession = () => { sessionVersion += 1; };
export const onSessionExpired = (listener) => {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
};

api.interceptors.request.use((config) => {
  config.sessionVersion = sessionVersion;
  return config;
});
api.interceptors.response.use((response) => response, (error) => {
  if (axios.isCancel(error)) return Promise.reject(error);
  const status = error.response?.status;
  // Old requests must not log out a newly established session.
  if (status === 401 && error.config?.url?.startsWith("/tasks") && error.config.sessionVersion === sessionVersion) {
    expiredListeners.forEach((listener) => listener());
  }
  const body = error.response?.data;
  const message = body?.fields?.[0]?.message || body?.message || "Không thể kết nối tới server. Vui lòng thử lại.";
  return Promise.reject(Object.assign(new Error(message), { status, code: body?.code, fields: body?.fields }));
});

export const register = async (data) => (await api.post("/auth/register", data)).data;
export const login = async (data) => (await api.post("/auth/login", data)).data;
export const logout = async () => (await api.post("/auth/logout")).data;
export const getMe = async (signal) => (await api.get("/auth/me", { signal })).data;
export const getAllTasks = async (page = 1, limit = 5, status = "all", signal) =>
  (await api.get("/tasks", { params: { page, limit, status }, signal })).data;
export const createTask = async (title) => (await api.post("/tasks", { title })).data;
export const updateTask = async (id, data) => (await api.patch(`/tasks/${id}`, data)).data;
export const deleteTask = async (id) => (await api.delete(`/tasks/${id}`)).data;
export const getTaskCounts = async (signal) => (await api.get("/tasks/counts", { signal })).data;

export default api;
