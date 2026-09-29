import express from "express";
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskCounts,
} from "../controllers/tasksControllers.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.use(auth);

router.get("/", getAllTasks);
router.get("/counts", getTaskCounts);
router.post("/", createTask);
router.put("/:id", updateTask);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;
