import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TaskForm = ({ onAddTask, loading }) => {
  const [title, setTitle] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading || !title.trim()) return;
    if (await onAddTask(title.trim())) setTitle("");
  };

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <Input
        placeholder="Nhập công việc mới..."
        aria-label="Công việc mới"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="flex-1"
        disabled={loading}
      />
      <Button type="submit" aria-label="Thêm công việc" size="icon" disabled={loading || !title.trim()}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
    </form>
  );
};

export default TaskForm;
