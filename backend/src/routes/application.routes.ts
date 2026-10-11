import { Router } from "express";
import {
  approveApplication,
  myApplications,
  rejectApplication,
  withdrawApplication,
} from "../controllers/application.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const applicationRouter = Router();

applicationRouter.use(requireAuth);
applicationRouter.get("/mine", requireRole("CREATOR"), myApplications);
applicationRouter.patch(
  "/:id/approve",
  requireRole("BRAND"),
  approveApplication,
);
applicationRouter.patch("/:id/reject", requireRole("BRAND"), rejectApplication);
applicationRouter.patch(
  "/:id/withdraw",
  requireRole("CREATOR"),
  withdrawApplication,
);
