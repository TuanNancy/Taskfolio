import Task from "../../models/Task.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  taskIdSchema,
} from "../validation/schemas.js";

export const getAllTasks = async (req, res) => {
  const { page, limit, status } = taskQuerySchema.parse(req.query);
  const filter = { userId: req.user._id };
  if (status !== "all") filter.status = status;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  res.json({
    tasks,
    pagination: {
      currentPage: page,
      totalPages,
      totalTasks: total,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
};

export const getTaskCounts = async (req, res) => {
  const groups = await Task.aggregate([
    { $match: { userId: req.user._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = { total: 0, active: 0, completed: 0 };
  for (const group of groups) {
    counts.total += group.count;
    if (group._id === "active" || group._id === "completed")
      counts[group._id] = group.count;
  }
  res.json(counts);
};

export const createTask = async (req, res) => {
  const { title } = createTaskSchema.parse(req.body);
  const task = await Task.create({ title, userId: req.user._id });
  res.status(201).json(task);
};

export const updateTask = async (req, res) => {
  const id = taskIdSchema.parse(req.params.id);
  const changes = updateTaskSchema.parse(req.body);
  if (changes.status) {
    // Each explicit completion records server time; title edits preserve it.
    changes.completedAt = changes.status === "completed" ? new Date() : null;
  }
  const task = await Task.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  );
  if (!task)
    throw new HttpError(404, "TASK_NOT_FOUND", "Công việc không tồn tại");
  res.json(task);
};

export const deleteTask = async (req, res) => {
  const id = taskIdSchema.parse(req.params.id);
  const task = await Task.findOneAndDelete({ _id: id, userId: req.user._id });
  if (!task)
    throw new HttpError(404, "TASK_NOT_FOUND", "Công việc không tồn tại");
  res.json({ message: "Công việc đã xóa thành công" });
};
