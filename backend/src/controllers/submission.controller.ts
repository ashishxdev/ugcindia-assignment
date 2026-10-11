import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { calculatePayout, roundRupees } from "../lib/money";
import { Application } from "../models/Application";
import { Campaign } from "../models/Campaign";
import { LedgerEntry } from "../models/LedgerEntry";
import { Submission } from "../models/Submission";
import { Wallet } from "../models/Wallet";
import { enqueueNotification } from "../services/notification.service";

const submitSchema = z.object({
  applicationId: z.string().min(1),
  url: z.url().refine((value) => {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host === "instagram.com" || host.endsWith(".instagram.com");
    } catch { return false; }
  }, "Enter a valid Instagram URL"),
});

const feedbackSchema = z.object({ feedback: z.string().trim().min(3).max(1000) });

export async function submitDeliverable(req: Request, res: Response) {
  const input = submitSchema.parse(req.body);
  const application = await Application.findOne({
    _id: input.applicationId,
    creator: req.user!.id,
    status: "APPROVED",
  });
  if (!application) throw new AppError(403, "You need an approved application to submit");

  const campaign = await Campaign.findById(application.campaign);
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (campaign.submissionDeadline < new Date()) throw new AppError(409, "The submission deadline has passed");

  const existing = await Submission.findOne({ application: application._id });
  let submission;
  const version = { url: input.url, submittedAt: new Date() };

  if (existing) {
    if (existing.status !== "REVISION_REQUESTED") {
      throw new AppError(409, "A deliverable has already been submitted for this application");
    }
    existing.url = input.url;
    existing.status = "SUBMITTED";
    existing.feedback = undefined;
    existing.versions.push(version);
    submission = await existing.save();
  } else {
    submission = await Submission.create({
      application: application._id,
      campaign: campaign._id,
      creator: req.user!.id,
      url: input.url,
      versions: [version],
    });
  }

  await enqueueNotification({
    recipient: campaign.brand,
    event: existing ? "DELIVERABLE_RESUBMITTED" : "DELIVERABLE_SUBMITTED",
    message: `A creator ${existing ? "resubmitted" : "submitted"} a deliverable for ${campaign.title}.`,
  });
  res.status(existing ? 200 : 201).json({ submission });
}

export async function mySubmissions(req: Request, res: Response) {
  const submissions = await Submission.find({ creator: req.user!.id })
    .populate("campaign", "title creatorFeeRupees submissionDeadline")
    .populate("application", "status")
    .sort({ updatedAt: -1 });
  res.json({ submissions });
}

export async function campaignSubmissions(req: Request, res: Response) {
  const campaign = await Campaign.findOne({ _id: req.params.campaignId, brand: req.user!.id });
  if (!campaign) throw new AppError(404, "Campaign not found");
  const submissions = await Submission.find({ campaign: campaign._id })
    .populate("creator", "name email")
    .populate("application", "status")
    .sort({ updatedAt: -1 });
  res.json({ submissions });
}

export async function requestRevision(req: Request, res: Response) {
  const input = feedbackSchema.parse(req.body);
  const submission = await Submission.findById(req.params.id);
  if (!submission) throw new AppError(404, "Submission not found");
  if (submission.status !== "SUBMITTED") throw new AppError(409, "Only submitted work can be reviewed");
  if (submission.revisionCount >= 2) throw new AppError(409, "The maximum of two revisions has been reached");

  const campaign = await Campaign.findOne({ _id: submission.campaign, brand: req.user!.id });
  if (!campaign) throw new AppError(403, "This is not your campaign");
  submission.status = "REVISION_REQUESTED";
  submission.revisionCount += 1;
  submission.feedback = input.feedback;
  await submission.save();

  await enqueueNotification({
    recipient: submission.creator,
    event: "REVISION_REQUESTED",
    message: `${campaign.title} needs a revision: ${input.feedback}`,
  });
  res.json({ submission });
}

export async function approveSubmission(req: Request, res: Response) {
  const session = await mongoose.startSession();
  let approvedSubmission;
  let payout;

  try {
    await session.withTransaction(async () => {
      const submission = await Submission.findById(req.params.id).session(session);
      if (!submission) throw new AppError(404, "Submission not found");
      if (submission.status !== "SUBMITTED") throw new AppError(409, "Only submitted work can be approved");

      const campaign = await Campaign.findOne({ _id: submission.campaign, brand: req.user!.id }).session(session);
      if (!campaign) throw new AppError(403, "This is not your campaign");
      if (campaign.reservedRupees < campaign.creatorFeeRupees) throw new AppError(409, "Campaign reservation is inconsistent");

      payout = calculatePayout(campaign.creatorFeeRupees);
      let wallet = await Wallet.findOne({ creator: submission.creator }).session(session);
      if (!wallet) {
        wallet = new Wallet({ creator: submission.creator });
      }
      wallet.availableRupees = roundRupees(wallet.availableRupees + payout.netRupees);
      wallet.lifetimeEarnedRupees = roundRupees(wallet.lifetimeEarnedRupees + payout.netRupees);
      await wallet.save({ session });

      await LedgerEntry.create([{
        creator: submission.creator,
        wallet: wallet._id,
        type: "PAYOUT_CREDIT",
        amountRupees: payout.netRupees,
        status: "COMPLETED",
        idempotencyKey: `submission:${submission._id}:credit`,
        referenceType: "SUBMISSION",
        referenceId: submission._id,
        description: `Payout for ${campaign.title}`,
        breakdown: payout,
      }], { session, ordered: true });

      campaign.reservedRupees = roundRupees(
        campaign.reservedRupees - campaign.creatorFeeRupees,
      );
      campaign.spentRupees = roundRupees(
        campaign.spentRupees + campaign.creatorFeeRupees,
      );
      if (
        campaign.reservedRupees === 0 &&
        (campaign.status === "CANCELLED" ||
          campaign.approvedCount >= campaign.slots)
      ) {
        campaign.status = "COMPLETED";
      }
      await campaign.save({ session });
      submission.status = "APPROVED";
      submission.feedback = undefined;
      submission.paidAt = new Date();
      approvedSubmission = await submission.save({ session });

      await enqueueNotification({
        recipient: submission.creator,
        event: "SUBMISSION_APPROVED",
        message: `${campaign.title} was approved. Your wallet was credited.`,
        session,
      });
    });
  } finally { await session.endSession(); }

  res.json({ submission: approvedSubmission, payout });
}

export async function rejectSubmission(req: Request, res: Response) {
  const input = feedbackSchema.parse(req.body);
  const session = await mongoose.startSession();
  let rejectedSubmission;

  try {
    await session.withTransaction(async () => {
      const submission = await Submission.findById(req.params.id).session(session);
      if (!submission) throw new AppError(404, "Submission not found");
      if (submission.status !== "SUBMITTED") throw new AppError(409, "Only submitted work can be rejected");
      const campaign = await Campaign.findOne({ _id: submission.campaign, brand: req.user!.id }).session(session);
      if (!campaign) throw new AppError(403, "This is not your campaign");

      campaign.reservedRupees = roundRupees(
        Math.max(0, campaign.reservedRupees - campaign.creatorFeeRupees),
      );
      if (
        campaign.reservedRupees === 0 &&
        (campaign.status === "CANCELLED" ||
          campaign.approvedCount >= campaign.slots)
      ) {
        campaign.status = "COMPLETED";
      }
      await campaign.save({ session });
      submission.status = "REJECTED";
      submission.feedback = input.feedback;
      rejectedSubmission = await submission.save({ session });
      await enqueueNotification({
        recipient: submission.creator,
        event: "SUBMISSION_REJECTED",
        message: `${campaign.title} was rejected: ${input.feedback}`,
        session,
      });
    });
  } finally { await session.endSession(); }

  res.json({ submission: rejectedSubmission });
}
