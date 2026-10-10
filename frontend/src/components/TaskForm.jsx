import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TaskForm = ({ onAddTask, loading, error, inputRef }) => {
  const [title, setTitle] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading || !title.trim()) return;
    if (await onAddTask(title.trim())) setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-busy={loading}>
      <label htmlFor="new-task" className="block text-sm font-semibold">Bạn muốn hoàn thành việc gì?</label>
      <div className="flex flex-col gap-3 min-[400px]:flex-row">
        <Input
          ref={inputRef}
          id="new-task"
          placeholder="Nhập công việc mới..."
          aria-label="Công việc mới"
          aria-describedby={error ? "new-task-error new-task-hint" : "new-task-hint"}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1"
          disabled={loading}
        />
        <Button type="submit" aria-label="Thêm công việc" size="lg" disabled={loading || !title.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          {loading ? "Đang thêm…" : "Thêm công việc"}
        </Button>
      </div>
      <div className="flex justify-between gap-3 text-xs leading-5 text-muted-foreground" id="new-task-hint">
        <span>Việc nhỏ hôm nay, tiến bộ mỗi ngày.</span>
        <span className="shrink-0 tabular-nums">{title.length}/200</span>
      </div>
      {error && <p id="new-task-error" role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
};

export default TaskForm;
