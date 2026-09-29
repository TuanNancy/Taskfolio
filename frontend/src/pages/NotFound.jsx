import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-[hsl(var(--foreground))] mb-4">
          404
        </h1>
        <p className="text-xl text-[hsl(var(--muted-foreground))] mb-2">
          Trang không tồn tại
        </p>
        <p className="text-[hsl(var(--muted-foreground))]">
          Đường dẫn bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.
        </p>
      </div>
      <Link className="underline text-[hsl(var(--primary))]" to="/">Về trang chủ</Link>
    </div>
  );
};

export default NotFound;
