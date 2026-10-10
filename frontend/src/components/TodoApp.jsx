import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCheck, CircleCheck, Inbox, ListTodo, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Brand from "@/components/Brand";
import TaskForm from "@/components/TaskForm";
import FilterBar from "@/components/FilterBar";
import TaskItem from "@/components/TaskItem";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";
import { useTasks } from "@/hooks/useTasks";

const headings = { all: "Tất cả công việc", active: "Công việc đang làm", completed: "Công việc đã hoàn thành" };
const emptyStates = {
  all: ["Một khởi đầu gọn gàng", "Thêm công việc đầu tiên để dành chỗ cho những điều quan trọng."],
  active: ["Bạn đã có một khoảng thảnh thơi", "Chưa có việc đang làm. Thêm một việc mới khi bạn sẵn sàng."],
  completed: ["Mỗi dấu tích là một bước tiến", "Những công việc bạn hoàn thành sẽ xuất hiện ở đây."],
};

export default function TodoApp() {
  const { user, logout, loggingOut } = useAuth();
  const data = useTasks();
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);
  const headingRef = useRef(null);
  const mutationFocus = useRef(null);
  useEffect(() => {
    const target = mutationFocus.current;
    if (!target) return;
    // Run after the DOM commits: a mutation can settle before React removes a row.
    if (!target.element?.isConnected) {
      if (document.activeElement === document.body) headingRef.current?.focus();
      mutationFocus.current = null;
    } else if (!data.pending.has(target.id)) mutationFocus.current = null;
  }, [data.tasks, data.pending]);
  const saveEdit = async (id) => {
    const title = editing?.title.trim();
    if (!title) {
      setEditing((current) => current && ({ ...current, error: "Tiêu đề không được để trống" }));
      return;
    }
    if (await data.edit(id, title)) setEditing((current) => current?.id === id ? null : current);
  };
  const handleLogout = async () => {
    try { await logout(); }
    catch (error) { toast.error(`Chưa đăng xuất được: ${error.message}`); }
  };
  const mutateTask = (operation, id) => {
    mutationFocus.current = { element: document.activeElement, id };
    return operation(id);
  };
  const changeFilter = (value) => { setEditing(null); data.changeFilter(value); };
  const [emptyTitle, emptyDescription] = emptyStates[data.filter];

  return <div className="min-h-screen">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">Đến nội dung chính</a>
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-8">
        <Brand />
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
          <span className="max-w-24 truncate text-sm font-medium sm:max-w-52" title={user?.username}>{user?.username}</span>
          <Button variant="ghost" size="icon" aria-label="Đăng xuất" title="Đăng xuất" disabled={loggingOut} onClick={handleLogout}>
            {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </header>

    <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl space-y-7 px-4 py-8 sm:px-8 sm:py-12">
      <section aria-labelledby="workspace-title">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          <ListTodo className="size-4" aria-hidden="true" /> Không gian của bạn
        </div>
        <h1 id="workspace-title" className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Công việc của bạn<span className="text-primary">.</span></h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">Bớt ngổn ngang. Thêm tập trung. Từng việc một.</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" aria-hidden="true" /><strong className="tabular-nums">{data.counts.active}</strong><span className="text-muted-foreground">đang làm</span></span>
          <span className="flex items-center gap-2"><CircleCheck className="size-4 text-primary" aria-hidden="true" /><strong className="tabular-nums">{data.counts.completed}</strong><span className="text-muted-foreground">đã hoàn thành</span></span>
        </div>
        {data.countsError && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-destructive">Chưa cập nhật được thống kê.<Button variant="ghost" size="sm" onClick={data.refresh}>Thử lại thống kê</Button></div>}
      </section>

      <Card className="p-5 sm:p-6">
        <TaskForm inputRef={inputRef} onAddTask={data.add} loading={data.pending.has("create")} error={data.mutationErrors.create} />
      </Card>

      <section aria-labelledby="task-list-title" className="space-y-4">
        <FilterBar filter={data.filter} counts={data.counts} onFilterChange={changeFilter} />
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <h2 ref={headingRef} tabIndex={-1} id="task-list-title" className="text-sm font-semibold">{headings[data.filter]}</h2>
          <span role="status" className="min-h-5 text-xs text-muted-foreground">
            {data.refreshing && <span className="flex items-center gap-2"><Loader2 className="size-3 animate-spin" aria-hidden="true" />{data.loading ? "Đang tải công việc…" : "Đang cập nhật…"}</span>}
          </span>
        </div>
        {data.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4 text-sm">
          <div><p className="font-semibold text-destructive">{data.hasData ? "Chưa cập nhật được danh sách" : "Chưa tải được công việc"}</p><p className="mt-1 text-muted-foreground">{data.error}</p></div>
          <Button variant="outline" onClick={data.refresh}><RefreshCw className="size-4" aria-hidden="true" />Thử lại</Button>
        </div>}
        <div aria-busy={data.refreshing}>
          {data.loading ? <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((item) => <div key={item} className="flex h-24 items-center gap-4 rounded-2xl border border-border bg-card p-5 motion-safe:animate-pulse">
              <div className="size-6 rounded-full bg-muted" /><div className="flex-1 space-y-3"><div className="h-3 w-2/3 rounded bg-muted" /><div className="h-2 w-1/3 rounded bg-muted" /></div>
            </div>)}
          </div> : <>
            <ul className="space-y-3">
              {data.tasks.map((task) => <li key={task._id}>
                <TaskItem task={task} pending={data.pending.has(task._id)} editingId={editing?.id} editingTitle={editing?.title || ""}
                  error={data.mutationErrors[task._id]} editError={editing?.id === task._id ? editing.error : null}
                  onToggle={(id) => mutateTask(data.toggle, id)} onDelete={(id) => mutateTask(data.remove, id)}
                  onStartEdit={(item) => setEditing({ id: item._id, title: item.title })}
                  onSaveEdit={saveEdit} onCancelEdit={() => setEditing(null)}
                  onEditTitleChange={(title) => setEditing((current) => current && ({ ...current, title, error: null }))} />
              </li>)}
            </ul>
            {!data.error && !data.refreshing && data.tasks.length === 0 && <Card className="flex flex-col items-center px-5 py-12 text-center">
              <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><Inbox className="size-6" aria-hidden="true" /></span>
              <h3 className="font-bold">{emptyTitle}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{emptyDescription}</p>
              <Button variant="ghost" className="mt-5 text-primary" onClick={() => data.filter === "completed" ? changeFilter("active") : inputRef.current?.focus()}>
                {data.filter === "completed" ? "Xem việc đang làm" : "Thêm một công việc"}<ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </Card>}
          </>}
        </div>
        {data.pagination && <Pagination currentPage={data.page} totalPages={data.pagination.totalPages} totalTasks={data.pagination.totalTasks}
          onPageChange={(page) => { setEditing(null); data.changePage(page); }} />}
      </section>
      <footer className="flex items-center justify-center gap-2 pt-4 pb-2 text-xs text-muted-foreground"><CheckCheck className="size-4" aria-hidden="true" />Dành chỗ cho những điều quan trọng.</footer>
    </main>
  </div>;
}
