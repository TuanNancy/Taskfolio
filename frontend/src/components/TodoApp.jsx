import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TaskForm from "@/components/TaskForm";
import FilterBar from "@/components/FilterBar";
import TaskItem from "@/components/TaskItem";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";
import { useTasks } from "@/hooks/useTasks";

const headings = { all: "Tất cả công việc", active: "Công việc đang làm", completed: "Công việc đã hoàn thành" };
const AnimatedShaderBackground = lazy(() => import("@/components/ui/animated-shader-background"));

export default function TodoApp() {
  const { user, logout, loggingOut } = useAuth();
  const data = useTasks();
  const [editing, setEditing] = useState(null);
  const saveEdit = async (id) => {
    const title = editing?.title.trim();
    if (!title) { toast.error("Tiêu đề không được để trống"); return; }
    if (await data.edit(id, title)) setEditing((current) => current?.id === id ? null : current);
  };
  const handleLogout = async () => {
    try { await logout(); }
    catch (error) { toast.error(`Chưa đăng xuất được: ${error.message}`); }
  };

  return <main className="min-h-screen relative isolate bg-slate-950 py-8 px-4">
    <Suspense fallback={null}><AnimatedShaderBackground /></Suspense>
    <div className="relative z-10 max-w-2xl mx-auto space-y-6">
      <Card className="bg-[hsl(var(--card))]/95 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-3xl font-bold">📝 Todo App</h1>
            <div className="flex items-center gap-2"><span>{user?.username}</span>
              <Button variant="ghost" size="icon" aria-label="Đăng xuất" disabled={loggingOut} onClick={handleLogout}><LogOut className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TaskForm onAddTask={data.add} loading={data.pending.has("create")} />
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400"><div className="text-2xl font-bold">{data.counts.active}</div><div>Đang làm</div></div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400"><div className="text-2xl font-bold">{data.counts.completed}</div><div>Hoàn thành</div></div>
          </div>
          {data.countsError && <p role="alert">Không thể cập nhật thống kê. <Button variant="ghost" onClick={data.refresh}>Thử lại</Button></p>}
          <FilterBar filter={data.filter} counts={data.counts} onFilterChange={(value) => { setEditing(null); data.changeFilter(value); }} />
        </CardContent>
      </Card>

      <Card className="bg-[hsl(var(--card))]/95 backdrop-blur-sm">
        <CardHeader><h2 className="text-xl font-semibold">{headings[data.filter]}</h2></CardHeader>
        <CardContent className="space-y-3" aria-busy={data.refreshing}>
          {data.refreshing && <p role="status">Đang tải công việc...</p>}
          {data.error ? <div role="alert"><p>{data.error}</p><Button onClick={data.refresh}>Thử lại</Button></div> : <>
            <ul className="space-y-2">
              {data.tasks.map((task) => <li key={task._id}>
                <TaskItem task={task} pending={data.pending.has(task._id)} editingId={editing?.id} editingTitle={editing?.title || ""}
                  onToggle={data.toggle} onDelete={data.remove} onStartEdit={(item) => setEditing({ id: item._id, title: item.title })}
                  onSaveEdit={saveEdit} onCancelEdit={() => setEditing(null)} onEditTitleChange={(title) => setEditing((current) => current && ({ ...current, title }))} />
              </li>)}
            </ul>
            {!data.loading && !data.refreshing && data.tasks.length === 0 && <p>Không có công việc trong bộ lọc này. Hãy thêm công việc mới hoặc đổi bộ lọc.</p>}
          </>}
          {data.pagination && <Pagination currentPage={data.page} totalPages={data.pagination.totalPages} totalTasks={data.pagination.totalTasks}
            onPageChange={(page) => { setEditing(null); data.changePage(page); }} />}
        </CardContent>
      </Card>
    </div>
  </main>;
}
