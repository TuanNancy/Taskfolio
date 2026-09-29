import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export default function AuthStatus() {
  const { loading, error, retry } = useAuth();
  return <div className="min-h-screen flex flex-col gap-4 items-center justify-center p-4">
    {loading ? <p role="status">Đang kiểm tra phiên đăng nhập...</p> : <>
      <p role="alert">{error}</p><Button onClick={retry}>Thử lại</Button>
    </>}
  </div>;
}
