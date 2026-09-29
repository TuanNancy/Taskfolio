import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Pagination = ({ currentPage, totalPages, totalTasks, onPageChange }) => {
  if (totalPages <= 1) return null;
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items = pages.flatMap((page, index) => index > 0 && page - pages[index - 1] > 1 ? [`gap-${page}`, page] : [page]);

  return (
    <nav aria-label="Phân trang công việc" className="flex flex-wrap gap-3 items-center justify-between">
      <div className="text-sm text-[hsl(var(--muted-foreground))]">
        Trang {currentPage} / {totalPages} ({totalTasks} công việc)
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Trang trước"
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {items.map((page) => typeof page === "string" ? <span key={page} aria-hidden="true">…</span> : (
          <Button
            key={page}
            variant={currentPage === page ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(page)}
            aria-current={currentPage === page ? "page" : undefined}
            className="min-w-[40px]"
          >
            {page}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Trang sau"
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
};

export default Pagination;
