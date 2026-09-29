import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { HttpError } from "./errorHandler.js";

const auth = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Chưa đăng nhập");

  let decoded;
  try {
    decoded = jwt.verify(token, req.app.locals.config.jwtSecret, { algorithms: ["HS256"] });
  } catch (error) {
    const expired = error.name === "TokenExpiredError";
    throw new HttpError(401, expired ? "SESSION_EXPIRED" : "INVALID_TOKEN", expired ? "Phiên đăng nhập đã hết hạn" : "Token không hợp lệ");
  }
  if (typeof decoded.userId !== "string" || !/^[a-f\d]{24}$/i.test(decoded.userId)) {
    throw new HttpError(401, "INVALID_TOKEN", "Token không hợp lệ");
  }
  // Keep database failures outside the JWT catch: an outage is not a bad session.
  const user = await User.findById(decoded.userId).select("-password");
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Phiên đăng nhập không còn hợp lệ");
  req.user = user;
  next();
};

export default auth;
