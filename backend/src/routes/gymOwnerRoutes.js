import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { loginGymOwner, signupGymOwner, logoutGymOwner, refreshGymOwnerToken, getGymMembers, getGymAttendance, sendMemberReminder, renewGymMember, addGymMember, updateGymMember, cancelGymMember } from "../controllers/gymOwnerController.js";

export const gymOwnerRoutes = Router();
gymOwnerRoutes.post("/signup", signupGymOwner);
gymOwnerRoutes.post("/login", loginGymOwner);
gymOwnerRoutes.post("/logout", logoutGymOwner);
gymOwnerRoutes.post("/refresh", refreshGymOwnerToken);
gymOwnerRoutes.get("/members", requireAuth, getGymMembers);
gymOwnerRoutes.get("/attendance", requireAuth, getGymAttendance);
gymOwnerRoutes.post("/send-reminder", requireAuth, sendMemberReminder);
gymOwnerRoutes.post("/renew-membership", requireAuth, renewGymMember);
gymOwnerRoutes.post("/add-member", requireAuth, addGymMember);
gymOwnerRoutes.put("/update-member", requireAuth, updateGymMember);
gymOwnerRoutes.post("/cancel-membership", requireAuth, cancelGymMember);

