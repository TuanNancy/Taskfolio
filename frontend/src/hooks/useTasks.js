import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAllTasks, getTaskCounts, createTask, updateTask, deleteTask } from "@/services/api";

export function useTasks() {
  const client = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(new Set());
  const [optimistic, setOptimistic] = useState({});
  const inFlight = useRef(new Set());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const list = useQuery({
    queryKey: ["tasks", page, filter],
    queryFn: ({ signal }) => getAllTasks(page, 5, filter, signal),
    retry: false,
  });
  const statistics = useQuery({ queryKey: ["taskCounts"], queryFn: ({ signal }) => getTaskCounts(signal), retry: false });
  const pagination = list.data?.pagination;

  useEffect(() => {
    if (!list.isFetching && !list.isError && pagination && page > Math.max(1, pagination.totalPages)) {
      // Server totals can shrink after deletion or completion under a filter.
      setPage(Math.max(1, pagination.totalPages));
    }
  }, [page, pagination, list.isFetching, list.isError]);

  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ["tasks"] }),
    client.invalidateQueries({ queryKey: ["taskCounts"] }),
  ]);

  const runMutation = async (id, operation, preview, successMessage) => {
    if (inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    setPending(new Set(inFlight.current));
    await client.cancelQueries({ queryKey: ["tasks"] });
    if (!mounted.current) { inFlight.current.delete(id); return false; }
    if (preview) setOptimistic((previous) => ({ ...previous, [id]: preview }));
    try {
      const result = await operation();
      if (!mounted.current) return false;
      await client.cancelQueries({ queryKey: ["tasks"] });
      if (!mounted.current) return false;
      // Merge only this row. Never restore an entire captured page on failure.
      if (id !== "create") client.setQueriesData({ queryKey: ["tasks"] }, (data) => data && ({
        ...data,
        tasks: result?._id ? data.tasks.map((task) => task._id === id ? result : task) : data.tasks.filter((task) => task._id !== id),
      }));
      toast.success(successMessage);
      return true;
    } catch (failure) {
      if (mounted.current) toast.error(failure.message);
      return false;
    } finally {
      if (mounted.current) {
        setOptimistic((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        // Also reconcile after timeouts: the server may already have committed.
        // Each settled write invalidates queries; TanStack cancels older refreshes.
        // Pending previews stay separate, so refetches cannot erase another preview.
        await refresh();
      }
      inFlight.current.delete(id);
      if (mounted.current) setPending(new Set(inFlight.current));
    }
  };

  const tasks = (list.data?.tasks || []).map((task) => optimistic[task._id] || task)
    .filter((task) => filter === "all" || task.status === filter);

  return {
    tasks, filter, page, pagination, pending,
    counts: statistics.data || { total: "—", active: "—", completed: "—" },
    loading: list.isPending, refreshing: list.isFetching,
    error: list.error?.message, countsError: statistics.error?.message,
    refresh,
    changeFilter: (value) => { setFilter(value); setPage(1); },
    changePage: setPage,
    add: async (title) => {
      const success = await runMutation("create", () => createTask(title), null, "Đã thêm công việc mới");
      if (success && mounted.current) { setFilter("all"); setPage(1); }
      return success;
    },
    toggle: (id) => {
      const task = tasks.find((item) => item._id === id);
      if (!task) return Promise.resolve(false);
      const status = task.status === "active" ? "completed" : "active";
      return runMutation(id, () => updateTask(id, { status }), { ...task, status, completedAt: null }, "Đã cập nhật trạng thái");
    },
    edit: (id, title) => runMutation(id, () => updateTask(id, { title }), null, "Đã cập nhật công việc"),
    remove: (id) => runMutation(id, () => deleteTask(id), null, "Đã xóa công việc"),
  };
}
