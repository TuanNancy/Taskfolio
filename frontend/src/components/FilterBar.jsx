import { Button } from "@/components/ui/button";

const filters = [["all", "Tất cả", "total"], ["active", "Đang làm", "active"], ["completed", "Hoàn thành", "completed"]];

export default function FilterBar({ filter, counts, onFilterChange }) {
  return <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-muted p-1" role="group" aria-label="Lọc trạng thái">
    {filters.map(([value, label, count]) => <Button
      key={value} variant="ghost" aria-pressed={filter === value} aria-label={`${label} (${counts[count]})`}
      onClick={() => onFilterChange(value)}
      className={`min-w-0 flex-1 basis-20 flex-wrap gap-x-2 px-2 text-xs sm:text-sm ${filter === value ? "bg-card text-primary shadow-sm hover:bg-card" : "text-muted-foreground"}`}
    >
      {label}<span aria-hidden="true" className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${filter === value ? "bg-secondary text-secondary-foreground" : "bg-background text-muted-foreground"}`}>{counts[count]}</span>
    </Button>)}
  </div>;
}
