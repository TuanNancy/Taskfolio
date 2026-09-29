import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { loginSchema, registerSchema } from "../validation/schemas.js";
import { HttpError } from "../middleware/errorHandler.js";

const generateToken = (userId, config) => {
  return jwt.sign({ userId: String(userId) }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.sessionSeconds,
  });
};

const setCookie = (req, res, userId) => {
  const config = req.app.locals.config;
  res.cookie("token", generateToken(userId, config), config.cookie);
};

export const register = async (req, res) => {
  const data = registerSchema.parse(req.body);
  // Unique indexes, rather than a pre-check, also handle concurrent registrations.
  const user = await User.create(data);
  setCookie(req, res, user._id);
  res.status(201).json({ user: { id: user._id, username: user.username, email: user.email } });
};

export const login = async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
  }
  setCookie(req, res, user._id);
  res.json({ user: { id: user._id, username: user.username, email: user.email } });
};

export const logout = async (req, res) => {
  const { httpOnly, secure, sameSite, path } = req.app.locals.config.cookie;
  res.clearCookie("token", { httpOnly, secure, sameSite, path });
  res.status(200).json({ message: "Đăng xuất thành công" });
};

export const getMe = async (req, res) => {
  res.status(200).json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
    },
  });
};
