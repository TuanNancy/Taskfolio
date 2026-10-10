import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import Brand from "@/components/Brand";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

export default function AuthStatus() {
  const { loading, error, retry } = useAuth();
  return <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-5 py-12">
    <Brand />
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      {loading ? <div role="status"><Loader2 className="mx-auto mb-4 size-7 animate-spin text-primary" aria-hidden="true" /><h1 className="font-bold">Đang kiểm tra phiên đăng nhập...</h1><p className="mt-2 text-sm text-muted-foreground">Không gian của bạn sẽ sẵn sàng ngay.</p></div> : <>
        <AlertCircle className="mx-auto mb-4 size-7 text-destructive" aria-hidden="true" />
        <h1 className="text-lg font-bold">Kết nối đang bị gián đoạn</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
        <Button onClick={retry} className="mt-6"><RefreshCw className="size-4" aria-hidden="true" />Thử lại</Button>
      </>}
    </div>
  </main>;
}
