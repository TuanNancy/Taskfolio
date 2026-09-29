import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Four parameters are required for Express to recognize error middleware.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Có lỗi hệ thống. Vui lòng thử lại sau.";
  let fields;

  if (error instanceof HttpError) {
    ({ status, code, message } = error);
  } else if (error instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.";
    fields = error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
  } else if (error.name === "ValidationError" || error.name === "CastError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Dữ liệu không hợp lệ.";
  } else if (error.code === 11000) {
    status = 409;
    code = "ACCOUNT_EXISTS";
    message = "Username hoặc email đã tồn tại";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "JSON không hợp lệ";
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = "BODY_TOO_LARGE";
    message = "Dữ liệu gửi lên quá lớn";
  } else if (["MongoNetworkError", "MongoServerSelectionError", "MongooseServerSelectionError"].includes(error.name)) {
    status = 503;
    code = "SERVICE_UNAVAILABLE";
    message = "Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.";
  }

  if (status >= 500) {
    // Never log raw errors: Mongoose validation errors can contain plaintext passwords.
    console.error(JSON.stringify({ event: "request_failed", requestId: req.id, code, status }));
  }
  res.status(status).json({ code, message, ...(fields && { fields }), requestId: req.id });
}
