import { Router } from "express";
import {
  approveSubmission,
  campaignSubmissions,
  mySubmissions,
  rejectSubmission,
  requestRevision,
  submitDeliverable,
} from "../controllers/submission.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const submissionRouter = Router();
submissionRouter.use(requireAuth);
submissionRouter.get("/mine", requireRole("CREATOR"), mySubmissions);
submissionRouter.get("/campaign/:campaignId", requireRole("BRAND"), campaignSubmissions);
submissionRouter.post("/", requireRole("CREATOR"), submitDeliverable);
submissionRouter.patch("/:id/revision", requireRole("BRAND"), requestRevision);
submissionRouter.patch("/:id/approve", requireRole("BRAND"), approveSubmission);
submissionRouter.patch("/:id/reject", requireRole("BRAND"), rejectSubmission);
