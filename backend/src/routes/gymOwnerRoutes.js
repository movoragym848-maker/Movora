import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { loginGymOwner, signupGymOwner, logoutGymOwner, refreshGymOwnerToken, getGymMembers, getGymAttendance, getGymStaff, addGymStaff, deleteGymStaff, sendMemberReminder, renewGymMember, addGymMember, updateGymMember, cancelGymMember } from "../controllers/gymOwnerController.js";

export const gymOwnerRoutes = Router();
gymOwnerRoutes.post("/signup", signupGymOwner);
gymOwnerRoutes.post("/login", loginGymOwner);
gymOwnerRoutes.post("/logout", logoutGymOwner);
gymOwnerRoutes.post("/refresh", refreshGymOwnerToken);
gymOwnerRoutes.get("/members", requireAuth, getGymMembers);
gymOwnerRoutes.get("/attendance", requireAuth, getGymAttendance);
gymOwnerRoutes.get("/staff", requireAuth, getGymStaff);
gymOwnerRoutes.post("/staff", requireAuth, addGymStaff);
gymOwnerRoutes.delete("/staff/:staffId", requireAuth, deleteGymStaff);
gymOwnerRoutes.post("/send-reminder", requireAuth, sendMemberReminder);
gymOwnerRoutes.post("/renew-membership", requireAuth, renewGymMember);
gymOwnerRoutes.post("/add-member", requireAuth, addGymMember);
gymOwnerRoutes.put("/update-member", requireAuth, updateGymMember);
gymOwnerRoutes.post("/cancel-membership", requireAuth, cancelGymMember);

