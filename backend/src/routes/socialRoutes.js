import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { createReel, getSocialProfile, listConversations, listMessages, listReels, saveSocialProfile, searchSocialProfiles, sendMessage, toggleFollow } from "../controllers/socialController.js";

export const socialRoutes = Router();
socialRoutes.use(requireAuth);
socialRoutes.get("/profile", getSocialProfile);
socialRoutes.put("/profile", saveSocialProfile);
socialRoutes.get("/search", searchSocialProfiles);
socialRoutes.post("/users/:userId/follow", toggleFollow);
socialRoutes.get("/reels", listReels);
socialRoutes.post("/reels", createReel);
socialRoutes.get("/conversations", listConversations);
socialRoutes.get("/conversations/:conversationId/messages", listMessages);
socialRoutes.post("/users/:userId/messages", sendMessage);
