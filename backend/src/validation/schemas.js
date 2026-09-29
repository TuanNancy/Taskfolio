import { z } from "zod";

const title = z.string().trim().min(1, "Tiêu đề không được để trống").max(200, "Tiêu đề tối đa 200 ký tự");
const status = z.enum(["active", "completed"]);
const email = z.string().trim().toLowerCase().max(254).email("Email không hợp lệ");
const password = z.string().min(1).refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Mật khẩu không được vượt quá 72 byte UTF-8",
);

export const createTaskSchema = z.object({ title }).strict();
export const updateTaskSchema = z.object({ title: title.optional(), status: status.optional() })
  .strict().refine((value) => Object.keys(value).length > 0, "Cần ít nhất một trường cập nhật");
export const taskIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "ID không hợp lệ");

const positiveInteger = (fallback, maximum) => z.string().regex(/^[1-9]\d*$/)
  .transform(Number).pipe(z.number().int().min(1).max(maximum)).default(fallback);

export const taskQuerySchema = z.object({
  page: positiveInteger(1, 10000),
  limit: positiveInteger(5, 100),
  status: z.enum(["all", "active", "completed"]).default("all"),
}).strict();

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email,
  password: password.refine((value) => value.length >= 8, "Mật khẩu cần ít nhất 8 ký tự"),
}).strict();

// Existing accounts with shorter passwords can still sign in.
export const loginSchema = z.object({ email, password }).strict();
