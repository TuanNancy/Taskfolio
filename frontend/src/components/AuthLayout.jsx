import { Check, Circle, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import Brand from "@/components/Brand";

export default function AuthLayout({ children }) {
  return <div className="min-h-screen">
    <header className="mx-auto max-w-6xl px-5 py-7 sm:px-10"><Link to="/" aria-label="Taskfolio — trang chủ" className="inline-flex rounded-xl"><Brand /></Link></header>
    <main className="mx-auto grid max-w-6xl items-center gap-16 px-5 pt-4 pb-12 sm:px-10 lg:min-h-[calc(100vh-180px)] lg:grid-cols-[1fr_420px] lg:py-10">
      <section className="hidden lg:block" aria-label="Về Taskfolio">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground"><span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />Một chút ngăn nắp mỗi ngày</span>
        <p className="mt-7 text-5xl leading-[1.2] font-extrabold tracking-tight">Nhẹ đầu hơn.<br /><span className="text-primary">Tiến xa hơn.</span></p>
        <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">Gom những việc cần làm về một nơi. Tập trung vào điều tiếp theo, rồi tận hưởng cảm giác hoàn thành.</p>
        <div className="mt-9 max-w-sm rounded-2xl border border-border bg-card p-5" aria-hidden="true">
          <div className="mb-5 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>TỪNG VIỆC MỘT</span><ArrowUpRight className="size-4" /></div>
          <div className="flex items-center gap-3 border-b border-border pb-4"><span className="flex size-7 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-4" /></span><span className="text-sm text-muted-foreground line-through">Sắp xếp lại ý tưởng</span></div>
          <div className="flex items-center gap-3 pt-4"><Circle className="size-7 text-primary" /><span className="text-sm font-medium">Bắt đầu điều quan trọng nhất</span></div>
        </div>
      </section>
      <div className="mx-auto w-full max-w-[440px]">{children}</div>
    </main>
    <footer className="px-5 pb-7 text-center text-xs text-muted-foreground">Taskfolio · Dành chỗ cho những điều quan trọng.</footer>
  </div>;
}
