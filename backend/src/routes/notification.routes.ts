import { Router } from "express";
import { myNotifications, updatePreferences } from "../controllers/notification.controller";
import { requireAuth } from "../middleware/auth";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get("/", myNotifications);
notificationRouter.patch("/preferences", updatePreferences);
