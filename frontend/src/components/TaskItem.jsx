import { useEffect, useId, useRef } from "react";
import { Check, X, Edit2, Trash2, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  if (date.toDateString() === now.toDateString()) {
    return `Hôm nay, ${date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Hôm qua, ${date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else {
    return date.toLocaleDateString("vi-VN", options);
  }
};

const TaskItem = ({
  task,
  editingId,
  editingTitle,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
  pending = false,
  error,
  editError,
}) => {
  const isEditing = editingId === task._id;
  const completed = task.status === "completed";
  const editButtonRef = useRef(null);
  const wasEditing = useRef(isEditing);
  const messageId = useId();
  useEffect(() => {
    if (wasEditing.current && !isEditing) editButtonRef.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 transition-colors duration-150 hover:border-primary/40 sm:p-4" aria-busy={pending}>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-3">
      <Button
        aria-label={`${completed ? "Mở lại" : "Hoàn thành"}: ${task.title}`}
        aria-pressed={completed}
        title={completed ? "Mở lại công việc" : "Đánh dấu hoàn thành"}
        disabled={pending || isEditing}
        size="icon"
        variant="ghost"
        onClick={() => onToggle(task._id)}
        className={completed ? "text-primary" : "text-muted-foreground"}
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : completed ? <Check className="size-5" aria-hidden="true" /> : <Circle className="size-5" aria-hidden="true" />}
      </Button>
      {isEditing ? (
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <label className="sr-only" htmlFor={`edit-${task._id}`}>Sửa tiêu đề</label>
          <Input
            id={`edit-${task._id}`}
            aria-invalid={Boolean(editError)}
            aria-describedby={error || editError ? messageId : undefined}
            maxLength={200}
            disabled={pending}
            value={editingTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") { e.preventDefault(); onSaveEdit(task._id); }
              if (e.key === "Escape") onCancelEdit();
            }}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onSaveEdit(task._id)}
            aria-label="Lưu chỉnh sửa"
            disabled={pending}
          >
            <Check className="h-4 w-4" aria-hidden="true" />{pending ? "Đang lưu…" : "Lưu"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelEdit}
            aria-label="Hủy chỉnh sửa"
            disabled={pending}
          >
            <X className="h-4 w-4" aria-hidden="true" />Hủy
          </Button>
          <span className="text-xs text-muted-foreground">Enter để lưu · Esc để hủy</span>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex flex-col gap-1.5 py-2 [overflow-wrap:anywhere]">
            <span
              className={`text-sm leading-6 font-medium sm:text-base ${completed ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"}`}
            >
              {task.title}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <div>
                <span>Tạo: {formatDate(task.createdAt)}</span>
              </div>
              {task.completedAt && (
                <>
                  <span>•</span>
                   <span>Hoàn thành: {formatDate(task.completedAt)}</span>
                </>
              )}
            </div>
          </div>
          <div className="col-start-2 flex flex-wrap items-center justify-end gap-1 sm:col-start-3">
          <Button
            ref={editButtonRef}
            size="icon"
            variant="ghost"
            onClick={() => onStartEdit(task)}
            aria-label={`Sửa: ${task.title}`}
            title="Sửa công việc"
            disabled={pending}
          >
            <Edit2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(task._id)}
            aria-label={`Xóa: ${task.title}`}
            title="Xóa công việc"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          </div>
        </>
      )}
      </div>
      {(error || editError) && <p id={messageId} role="alert" className="mt-3 px-2 text-sm text-destructive">{editError || error}</p>}
    </div>
  );
};

export default TaskItem;
