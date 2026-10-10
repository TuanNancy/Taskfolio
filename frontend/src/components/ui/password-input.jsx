import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PasswordInput({ id, disabled, ...props }) {
  const [visible, setVisible] = useState(false);
  const label = id === "confirm-password" ? "mật khẩu xác nhận" : "mật khẩu";
  return <div className="relative">
    <Input {...props} id={id} disabled={disabled} type={visible ? "text" : "password"} className="pr-14" />
    <Button variant="ghost" size="icon" className="absolute top-0.5 right-0.5 text-muted-foreground" aria-label={`${visible ? "Ẩn" : "Hiện"} ${label}`} aria-controls={id} aria-pressed={visible} disabled={disabled} onClick={() => setVisible((value) => !value)}>
      {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
    </Button>
  </div>;
}
