import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/ui/password-input";
import AuthLayout from "@/components/AuthLayout";
import AuthStatus from "@/components/AuthStatus";
import { login, register } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

const labels = { username: "Tên người dùng", email: "Email", password: "Mật khẩu", "confirm-password": "Xác nhận mật khẩu" };

export default function AuthForm({ mode }) {
  const signingUp = mode === "register";
  const [values, setValues] = useState({ username: "", email: "", password: "", "confirm-password": "" });
  const [errors, setErrors] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef(null);
  const pendingRef = useRef(false);
  const navigate = useNavigate();
  const { user, setUserFromAuth, loading: initializing, error } = useAuth();
  useEffect(() => { if (errors) errorRef.current?.focus(); }, [errors]);

  if (initializing || error) return <AuthStatus />;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const next = {};
    const { email, username, password } = values;
    if (!email.trim()) next.email = "Nhập địa chỉ email của bạn.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Nhập email hợp lệ, ví dụ ban@example.com.";
    if (!password) next.password = "Nhập mật khẩu của bạn.";
    if (signingUp) {
      if (username.trim().length < 3) next.username = "Tên người dùng cần từ 3 đến 30 ký tự.";
      if (password.length < 8 || new TextEncoder().encode(password).length > 72) next.password = "Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.";
      if (!values["confirm-password"]) next["confirm-password"] = "Nhập lại mật khẩu để xác nhận.";
      else if (password !== values["confirm-password"]) next["confirm-password"] = "Mật khẩu xác nhận không khớp.";
    }
    if (Object.keys(next).length) { setErrors(next); return; }

    pendingRef.current = true;
    setSubmitting(true);
    setErrors(null);
    try {
      const data = signingUp ? await register({ username: username.trim(), email: email.trim(), password }) : await login({ email: email.trim(), password });
      setUserFromAuth(data.user);
      toast.success(signingUp ? "Tài khoản đã sẵn sàng. Chào mừng bạn!" : "Chào mừng bạn trở lại!");
      navigate("/", { replace: true });
    } catch (failure) {
      const fieldErrors = {};
      for (const issue of failure.fields || []) {
        if (labels[issue.field] && (signingUp || ["email", "password"].includes(issue.field))) fieldErrors[issue.field] = issue.message;
      }
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: failure.message || "Chưa kết nối được với máy chủ. Vui lòng thử lại." });
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  const field = (name, options = {}) => {
    const { hint, ...attributes } = options;
    const password = name.includes("password");
    const Control = password ? PasswordInput : Input;
    return <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-semibold">{labels[name]}</label>
      <Control {...attributes} id={name} value={values[name]} required disabled={submitting}
        onChange={(event) => {
          const value = event.target.value;
          setValues((previous) => ({ ...previous, [name]: value }));
        }}
        aria-invalid={Boolean(errors?.[name])}
        aria-describedby={[errors?.[name] && `${name}-error`, hint && `${name}-hint`].filter(Boolean).join(" ") || undefined} />
      {hint && <p id={`${name}-hint`} className="text-xs leading-5 text-muted-foreground">{hint}</p>}
      {errors?.[name] && <p id={`${name}-error`} className="text-sm leading-5 text-destructive">{errors[name]}</p>}
    </div>;
  };

  return <AuthLayout>
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">{signingUp ? "Bắt đầu hành trình" : "Rất vui gặp lại bạn"}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{signingUp ? "Tạo tài khoản" : "Đăng nhập"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{signingUp ? "Một nơi riêng cho công việc và những dự định của bạn." : "Không gian của bạn đã sẵn sàng. Cùng tiếp tục nhé."}</p>
      <form noValidate onSubmit={handleSubmit} className="mt-7 space-y-5" aria-busy={submitting}>
        {errors && <div ref={errorRef} tabIndex={-1} role="alert" aria-labelledby="auth-error-title" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p id="auth-error-title" className="flex items-start gap-2 font-semibold text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{errors.form || "Kiểm tra lại thông tin bên dưới"}</p>
          {!errors.form && <ul className="mt-2 space-y-1 pl-6">
            {Object.entries(errors).map(([name]) => <li key={name}><a href={`#${name}`} className="inline-block py-1 text-destructive underline underline-offset-4" onClick={(event) => { event.preventDefault(); document.getElementById(name)?.focus(); }}>{labels[name]}</a></li>)}
          </ul>}
        </div>}
        {signingUp && field("username", { autoComplete: "username", minLength: 3, maxLength: 30, placeholder: "Tên bạn muốn sử dụng" })}
        {field("email", { type: "email", autoComplete: "email", maxLength: 254, placeholder: "ban@example.com" })}
        {field("password", { autoComplete: signingUp ? "new-password" : "current-password", placeholder: "Nhập mật khẩu", ...(signingUp && { minLength: 8, hint: "Từ 8 ký tự, tối đa 72 byte UTF-8. Bạn có thể dùng trình quản lý mật khẩu." }) })}
        {signingUp && field("confirm-password", { autoComplete: "new-password", minLength: 8, placeholder: "Nhập lại mật khẩu" })}
        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{signingUp ? "Đang đăng ký…" : "Đang đăng nhập…"}</> : <>{signingUp ? "Đăng ký" : "Đăng nhập"}<ArrowRight className="size-4" aria-hidden="true" /></>}
        </Button>
      </form>
      <p className="mt-6 border-t border-border pt-5 text-center text-sm leading-6 text-muted-foreground">
        {signingUp ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
        <Link to={signingUp ? "/login" : "/register"} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">{signingUp ? "Đăng nhập" : "Đăng ký ngay"}</Link>
      </p>
    </div>
  </AuthLayout>;
}
