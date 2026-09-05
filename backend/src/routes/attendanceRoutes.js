import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { checkIn } from "../controllers/attendanceController.js";

export const attendanceRoutes = Router();
attendanceRoutes.post("/check-in", requireAuth, checkIn);
