import { Router } from "express";
import {
  cancelCampaign,
  createCampaign,
  discoverCampaigns,
  getCampaign,
  myCampaigns,
  updateCampaign,
} from "../controllers/campaign.controller";
import {
  applyToCampaign,
  campaignApplications,
} from "../controllers/application.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const campaignRouter = Router();

campaignRouter.use(requireAuth);
campaignRouter.get("/", discoverCampaigns);
campaignRouter.get("/mine", requireRole("BRAND"), myCampaigns);
campaignRouter.post("/", requireRole("BRAND"), createCampaign);
campaignRouter.get("/:id", getCampaign);
campaignRouter.patch("/:id", requireRole("BRAND"), updateCampaign);
campaignRouter.patch("/:id/cancel", requireRole("BRAND"), cancelCampaign);
campaignRouter.post(
  "/:campaignId/applications",
  requireRole("CREATOR"),
  applyToCampaign,
);
campaignRouter.get(
  "/:campaignId/applications",
  requireRole("BRAND"),
  campaignApplications,
);
