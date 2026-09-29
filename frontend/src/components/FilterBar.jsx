import { Button } from "@/components/ui/button";

const FilterBar = ({ filter, counts, onFilterChange }) => {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc trạng thái">
      <Button
        variant={filter === "all" ? "default" : "outline"}
        aria-pressed={filter === "all"}
        size="sm"
        onClick={() => onFilterChange("all")}
        className="flex-1"
      >
        Tất cả ({counts.total})
      </Button>
      <Button
        variant={filter === "active" ? "default" : "outline"}
        aria-pressed={filter === "active"}
        size="sm"
        onClick={() => onFilterChange("active")}
        className="flex-1"
      >
        Đang làm ({counts.active})
      </Button>
      <Button
        variant={filter === "completed" ? "default" : "outline"}
        aria-pressed={filter === "completed"}
        size="sm"
        onClick={() => onFilterChange("completed")}
        className="flex-1"
      >
        Hoàn thành ({counts.completed})
      </Button>
    </div>
  );
};

export default FilterBar;
