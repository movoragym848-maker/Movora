import { Router } from "express";
import { login, logout, signup, refresh, checkGymRegistered, getRegisteredGyms, sendPhoneOTP, verifyPhoneOTP } from "../controllers/authController.js";

export const authRoutes = Router();
authRoutes.post("/signup", signup);
authRoutes.post("/login", login);
authRoutes.post("/logout", logout);
authRoutes.post("/refresh", refresh);
authRoutes.get("/check-gym", checkGymRegistered);
authRoutes.get("/gyms", getRegisteredGyms);
authRoutes.post("/send-otp", sendPhoneOTP);
authRoutes.post("/verify-otp", verifyPhoneOTP);
