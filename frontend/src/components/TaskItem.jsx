import { Check, X, Edit2, Trash2, Calendar, Circle } from "lucide-react";
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
}) => {
  return (
    <div
      className={`flex items-center gap-3 p-3 border border-[hsl(var(--border))] rounded-lg transition-all ${
        task.status === "completed"
          ? "opacity-75 hover:opacity-100"
          : "hover:bg-[hsl(var(--accent))]"
      }`}
    >
      <Button
        aria-label={`Hoàn thành: ${task.title}`}
        aria-pressed={task.status === "completed"}
        disabled={pending || editingId === task._id}
        size="icon"
        variant="ghost"
        onClick={() => onToggle(task._id)}
        className={`${
          task.status === "completed"
            ? "text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        }`}
      >
        {task.status === "completed" ? (
          <Check className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </Button>
      {editingId === task._id ? (
        <div className="flex-1 flex gap-2">
          <Input
            aria-label="Sửa tiêu đề"
            maxLength={200}
            disabled={pending}
            value={editingTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit(task._id);
              if (e.key === "Escape") onCancelEdit();
            }}
            className="flex-1"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onSaveEdit(task._id)}
            aria-label="Lưu chỉnh sửa"
            disabled={pending}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onCancelEdit}
            aria-label="Hủy chỉnh sửa"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1 flex flex-col gap-1 break-words">
            <span
              className={`${
                task.status === "completed" ? "line-through" : ""
              } ${
                task.status === "completed"
                  ? "text-[hsl(var(--muted-foreground))]"
                  : ""
              }`}
            >
              {task.title}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Tạo: {formatDate(task.createdAt)}</span>
              </div>
              {task.completedAt && (
                <>
                  <span>•</span>
                  <span>{formatDate(task.completedAt)}</span>
                </>
              )}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onStartEdit(task)}
            aria-label={`Sửa: ${task.title}`}
            disabled={pending}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(task._id)}
            aria-label={`Xóa: ${task.title}`}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </>
      )}
    </div>
  );
};

export default TaskItem;
