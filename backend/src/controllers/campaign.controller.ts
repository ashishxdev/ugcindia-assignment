import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { roundRupees } from "../lib/money";
import { Application } from "../models/Application";
import { Campaign } from "../models/Campaign";
import { Submission } from "../models/Submission";
import { enqueueNotification } from "../services/notification.service";

const campaignSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(1200),
    budgetRupees: z.coerce.number().positive(),
    creatorFeeRupees: z.coerce.number().positive(),
    slots: z.coerce.number().int().positive().max(1000),
    applicationDeadline: z.coerce.date(),
    submissionDeadline: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (value.applicationDeadline <= new Date()) {
      ctx.addIssue({
        code: "custom",
        path: ["applicationDeadline"],
        message: "Application deadline must be in the future",
      });
    }
    if (value.submissionDeadline <= value.applicationDeadline) {
      ctx.addIssue({
        code: "custom",
        path: ["submissionDeadline"],
        message: "Submission deadline must be after the application deadline",
      });
    }
    if (value.creatorFeeRupees * value.slots > value.budgetRupees) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetRupees"],
        message: "Budget must cover the fee for every slot",
      });
    }
  });

const campaignUpdateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1200),
  budgetRupees: z.coerce.number().positive(),
  creatorFeeRupees: z.coerce.number().positive(),
  slots: z.coerce.number().int().positive().max(1000),
  applicationDeadline: z.coerce.date(),
  submissionDeadline: z.coerce.date(),
});

export async function createCampaign(req: Request, res: Response) {
  const input = campaignSchema.parse(req.body);
  const campaign = await Campaign.create({
    brand: req.user!.id,
    title: input.title,
    description: input.description,
    budgetRupees: Math.round(input.budgetRupees * 100) / 100,
    creatorFeeRupees: Math.round(input.creatorFeeRupees * 100) / 100,
    slots: input.slots,
    applicationDeadline: input.applicationDeadline,
    submissionDeadline: input.submissionDeadline,
  });

  res.status(201).json({ campaign });
}

export async function discoverCampaigns(_req: Request, res: Response) {
  const campaigns = await Campaign.find({
    status: "ACTIVE",
    applicationDeadline: { $gt: new Date() },
    $expr: { $lt: ["$approvedCount", "$slots"] },
  })
    .populate("brand", "name")
    .sort({ createdAt: -1 });
  res.json({ campaigns });
}

export async function myCampaigns(req: Request, res: Response) {
  await Promise.all([
    Campaign.updateMany(
      {
        brand: req.user!.id,
        status: "CANCELLED",
        approvedCount: { $gt: 0 },
        reservedRupees: 0,
      },
      { $set: { status: "COMPLETED" } },
    ),
    Campaign.updateMany(
      {
        brand: req.user!.id,
        status: "ACTIVE",
        approvedCount: { $gt: 0 },
        reservedRupees: 0,
        $expr: { $gte: ["$approvedCount", "$slots"] },
      },
      { $set: { status: "COMPLETED" } },
    ),
  ]);
  const campaigns = await Campaign.find({ brand: req.user!.id })
    .sort({ createdAt: -1 })
    .lean();
  const submissions = await Submission.find({
    campaign: { $in: campaigns.map((campaign) => campaign._id) },
  })
    .select("campaign status")
    .lean();

  const submissionCounts = new Map<
    string,
    { paidCount: number; rejectedCount: number }
  >();
  for (const submission of submissions) {
    const campaignId = String(submission.campaign);
    const counts = submissionCounts.get(campaignId) ?? {
      paidCount: 0,
      rejectedCount: 0,
    };
    if (submission.status === "APPROVED") counts.paidCount += 1;
    if (submission.status === "REJECTED") counts.rejectedCount += 1;
    submissionCounts.set(campaignId, counts);
  }

  res.json({
    campaigns: campaigns.map((campaign) => {
      const counts = submissionCounts.get(String(campaign._id)) ?? {
        paidCount: 0,
        rejectedCount: 0,
      };
      const activeCount = Math.max(
        0,
        campaign.approvedCount - counts.paidCount - counts.rejectedCount,
      );
      return {
        ...campaign,
        collaborationStats: {
          selectedCount: campaign.approvedCount,
          activeCount,
          paidCount: counts.paidCount,
          rejectedCount: counts.rejectedCount,
          currentCount: activeCount + counts.paidCount,
        },
      };
    }),
  });
}

export async function getCampaign(req: Request, res: Response) {
  const campaign = await Campaign.findById(req.params.id).populate(
    "brand",
    "name",
  );
  if (!campaign) throw new AppError(404, "Campaign not found");
  res.json({ campaign });
}

export async function updateCampaign(req: Request, res: Response) {
  const input = campaignUpdateSchema.parse(req.body);
  const campaign = await Campaign.findOne({
    _id: req.params.id,
    brand: req.user!.id,
  });
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (campaign.status !== "ACTIVE")
    throw new AppError(409, "Cancelled campaigns cannot be edited");
  if (input.submissionDeadline <= input.applicationDeadline)
    throw new AppError(
      400,
      "Submission deadline must be after the application deadline",
    );
  if (
    campaign.approvedCount > 0 &&
    roundRupees(input.creatorFeeRupees) !== campaign.creatorFeeRupees
  ) {
    throw new AppError(
      409,
      "Creator fee cannot change after a creator has been selected",
    );
  }
  if (input.slots < campaign.approvedCount)
    throw new AppError(
      409,
      `Slots cannot be lower than the ${campaign.approvedCount} selected creators`,
    );

  const budgetRupees = roundRupees(input.budgetRupees);
  const creatorFeeRupees = roundRupees(input.creatorFeeRupees);
  const committedRupees = roundRupees(
    campaign.reservedRupees + campaign.spentRupees,
  );
  if (budgetRupees < committedRupees)
    throw new AppError(
      409,
      `Budget cannot be lower than the committed amount of ₹${committedRupees.toFixed(2)}`,
    );
  if (creatorFeeRupees * input.slots > budgetRupees)
    throw new AppError(400, "Budget must cover the fee for every slot");

  campaign.title = input.title;
  campaign.description = input.description;
  campaign.budgetRupees = budgetRupees;
  campaign.creatorFeeRupees = creatorFeeRupees;
  campaign.slots = input.slots;
  campaign.applicationDeadline = input.applicationDeadline;
  campaign.submissionDeadline = input.submissionDeadline;
  await campaign.save();
  const selectedApplications = await Application.find({
    campaign: campaign._id,
    status: "APPROVED",
  }).select("creator");
  await Promise.all(
    selectedApplications.map((application) =>
      enqueueNotification({
        recipient: application.creator,
        event: "CAMPAIGN_UPDATED",
        message: `${campaign.title} campaign details were updated. Review the latest brief and deadlines.`,
      }),
    ),
  );
  res.json({ campaign });
}

export async function cancelCampaign(req: Request, res: Response) {
  const session = await mongoose.startSession();
  let cancelledCampaign;
  let closedApplications = 0;

  try {
    await session.withTransaction(async () => {
      const campaign = await Campaign.findOne({
        _id: req.params.id,
        brand: req.user!.id,
      }).session(session);
      if (!campaign) throw new AppError(404, "Campaign not found");
      if (campaign.status === "CANCELLED")
        throw new AppError(409, "Campaign is already cancelled");

      const pendingApplications = await Application.find({
        campaign: campaign._id,
        status: "APPLIED",
      }).session(session);
      for (const application of pendingApplications) {
        application.status = "REJECTED";
        await application.save({ session });
        await enqueueNotification({
          recipient: application.creator,
          event: "CAMPAIGN_CANCELLED",
          message: `${campaign.title} was cancelled and is no longer accepting applications.`,
          session,
        });
      }
      const selectedApplications = await Application.find({
        campaign: campaign._id,
        status: "APPROVED",
      }).session(session);
      for (const application of selectedApplications) {
        await enqueueNotification({
          recipient: application.creator,
          event: "CAMPAIGN_CANCELLED_SELECTED_CREATOR",
          message: `${campaign.title} was cancelled for new applications, but you may still finish and submit your approved work.`,
          session,
        });
      }

      campaign.status =
        campaign.approvedCount > 0 && campaign.reservedRupees === 0
          ? "COMPLETED"
          : "CANCELLED";
      cancelledCampaign = await campaign.save({ session });
      closedApplications = pendingApplications.length;
    });
  } finally {
    await session.endSession();
  }

  res.json({ campaign: cancelledCampaign, closedApplications });
}
