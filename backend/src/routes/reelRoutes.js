import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { createR2Reel, createReelUploadUrl, downloadOriginalReel, serveReelHlsAsset } from "../controllers/reelUploadController.js";

export const reelRoutes = Router();
reelRoutes.use(requireAuth);
reelRoutes.get("/upload-url", createReelUploadUrl);
reelRoutes.post("/", createR2Reel);
reelRoutes.get("/:reelId/hls/:variant/:file", serveReelHlsAsset);
reelRoutes.get("/:reelId/hls/:file", serveReelHlsAsset);
reelRoutes.get("/:reelId/original", downloadOriginalReel);
