import { Link } from "react-router-dom";
import Brand from "@/components/Brand";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const NotFound = () => {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-5 py-12">
      <Brand />
      <div className="text-center">
        <h1 className="text-7xl font-extrabold tracking-tight text-primary mb-5">
          404
        </h1>
        <p className="text-xl text-[hsl(var(--muted-foreground))] mb-2">
          Trang không tồn tại
        </p>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Đường dẫn bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.
        </p>
      </div>
      <Link className={buttonVariants()} to="/"><ArrowLeft className="size-4" aria-hidden="true" />Về trang chủ</Link>
    </main>
  );
};

export default NotFound;
