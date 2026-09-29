import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { register } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import AuthStatus from "@/components/AuthStatus";

const RegisterPage = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, setUserFromAuth, loading: initializing, error } = useAuth();

  if (initializing || error) return <AuthStatus />;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username || !email || !password || !confirmPassword) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }

    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      toast.error("Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte UTF-8");
      return;
    }

    try {
      setLoading(true);
      const data = await register({ username, email, password });
      setUserFromAuth(data.user);
      toast.success("Đăng ký thành công!");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Đăng ký</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">Username</label>
              <Input
                id="username" autoComplete="username" required minLength={3} maxLength={30}
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input
                id="email" autoComplete="email" required maxLength={254}
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Mật khẩu</label>
              <Input
                id="password" autoComplete="new-password" required minLength={8}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">Xác nhận mật khẩu</label>
              <Input
                id="confirm-password" autoComplete="new-password" required minLength={8}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} aria-label="Đăng ký" aria-busy={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Đăng ký"}
            </Button>
          </form>
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))] mt-4">
            Đã có tài khoản?{" "}
            <Link to="/login" className="text-[hsl(var(--primary))] hover:underline">
              Đăng nhập
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegisterPage;
