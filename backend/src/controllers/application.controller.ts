import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { roundRupees } from "../lib/money";
import { Application } from "../models/Application";
import { Campaign } from "../models/Campaign";
import { Submission } from "../models/Submission";
import { enqueueNotification } from "../services/notification.service";

const applicationSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export async function applyToCampaign(req: Request, res: Response) {
  const input = applicationSchema.parse(req.body);
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    status: "ACTIVE",
    applicationDeadline: { $gt: new Date() },
  });

  if (!campaign)
    throw new AppError(404, "This campaign is not accepting applications");

  const application = await Application.create({
    campaign: campaign._id,
    creator: req.user!.id,
    note: input.note,
  });

  await enqueueNotification({
    recipient: campaign.brand,
    event: "CREATOR_APPLIED",
    message: `A creator applied to ${campaign.title}.`,
  });

  res.status(201).json({ application });
}

export async function myApplications(req: Request, res: Response) {
  const applications = await Application.find({ creator: req.user!.id })
    .populate({ path: "campaign", populate: { path: "brand", select: "name" } })
    .sort({ createdAt: -1 });
  res.json({ applications });
}

export async function campaignApplications(req: Request, res: Response) {
  const campaign = await Campaign.findById(req.params.campaignId);
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (String(campaign.brand) !== req.user!.id)
    throw new AppError(403, "This is not your campaign");

  const applications = await Application.find({ campaign: campaign._id })
    .populate("creator", "name email")
    .sort({ createdAt: -1 });
  res.json({ applications });
}

export async function approveApplication(req: Request, res: Response) {
  const session = await mongoose.startSession();
  let approvedApplication;

  try {
    await session.withTransaction(async () => {
      const application = await Application.findById(req.params.id).session(
        session,
      );
      if (!application) throw new AppError(404, "Application not found");
      if (application.status !== "APPLIED")
        throw new AppError(409, "Only pending applications can be approved");

      const campaign = await Campaign.findOne({
        _id: application.campaign,
        brand: req.user!.id,
        status: "ACTIVE",
      }).session(session);

      if (!campaign)
        throw new AppError(404, "Campaign not found or is no longer active");
      if (campaign.approvedCount >= campaign.slots)
        throw new AppError(409, "No campaign slots are available");
      if (
        campaign.reservedRupees + campaign.spentRupees + campaign.creatorFeeRupees >
        campaign.budgetRupees
      ) {
        throw new AppError(
          409,
          "The campaign does not have enough available budget",
        );
      }

      campaign.approvedCount += 1;
      campaign.reservedRupees = roundRupees(
        campaign.reservedRupees + campaign.creatorFeeRupees,
      );
      await campaign.save({ session });
      application.status = "APPROVED";
      approvedApplication = await application.save({ session });
      await enqueueNotification({
        recipient: application.creator,
        event: "APPLICATION_APPROVED",
        message: `Your application for ${campaign.title} was approved.`,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  res.json({ application: approvedApplication });
}

export async function rejectApplication(req: Request, res: Response) {
  const application = await Application.findById(req.params.id);
  if (!application) throw new AppError(404, "Application not found");
  if (application.status !== "APPLIED")
    throw new AppError(409, "Only pending applications can be rejected");

  const campaign = await Campaign.findById(application.campaign);
  if (!campaign || String(campaign.brand) !== req.user!.id)
    throw new AppError(403, "This is not your campaign");

  application.status = "REJECTED";
  await application.save();
  await enqueueNotification({
    recipient: application.creator,
    event: "APPLICATION_REJECTED",
    message: `Your application for ${campaign.title} was not selected.`,
  });
  res.json({ application });
}

export async function withdrawApplication(req: Request, res: Response) {
  const session = await mongoose.startSession();
  let withdrawnApplication;

  try {
    await session.withTransaction(async () => {
      const application = await Application.findOne({
        _id: req.params.id,
        creator: req.user!.id,
      }).session(session);
      if (!application) throw new AppError(404, "Application not found");
      if (
        !(["APPLIED", "APPROVED"] as const).includes(
          application.status as "APPLIED" | "APPROVED",
        )
      ) {
        throw new AppError(409, "This application can no longer be withdrawn");
      }

      if (await Submission.exists({ application: application._id }).session(session)) {
        throw new AppError(409, "You cannot withdraw after submitting a deliverable");
      }

      const campaign = await Campaign.findById(application.campaign).session(session);
      if (!campaign) throw new AppError(404, "Campaign not found");

      if (application.status === "APPROVED") {
        campaign.approvedCount -= 1;
        campaign.reservedRupees = roundRupees(
          campaign.reservedRupees - campaign.creatorFeeRupees,
        );
        await campaign.save({ session });
      }

      application.status = "WITHDRAWN";
      application.withdrawnAt = new Date();
      withdrawnApplication = await application.save({ session });
      await enqueueNotification({
        recipient: campaign.brand,
        event: "CREATOR_WITHDREW",
        message: `A creator withdrew from ${campaign.title}.`,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  res.json({ application: withdrawnApplication });
}
