import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listGymCampaigns } from "../controllers/marketingController.js";

export const marketingRoutes = Router();
marketingRoutes.get("/campaigns/gym/:gymId", requireAuth, listGymCampaigns);
