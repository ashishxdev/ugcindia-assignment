import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { roundRupees } from "../lib/money";
import { LedgerEntry } from "../models/LedgerEntry";
import { Wallet } from "../models/Wallet";
import { Withdrawal } from "../models/Withdrawal";
import { enqueueNotification } from "../services/notification.service";

const withdrawalSchema = z.object({
  amountRupees: z.coerce.number().positive(),
  mockOutcome: z.enum(["SUCCESS", "FAILURE"]).default("SUCCESS"),
});

export async function getWallet(req: Request, res: Response) {
  const wallet = await Wallet.findOneAndUpdate(
    { creator: req.user!.id },
    { $setOnInsert: { creator: req.user!.id } },
    { upsert: true, returnDocument: "after" },
  );
  const [ledger, withdrawals] = await Promise.all([
    LedgerEntry.find({ creator: req.user!.id }).sort({ createdAt: -1 }).limit(100),
    Withdrawal.find({ creator: req.user!.id }).sort({ createdAt: -1 }).limit(50),
  ]);
  res.json({ wallet, ledger, withdrawals });
}

export async function requestWithdrawal(req: Request, res: Response) {
  const input = withdrawalSchema.parse(req.body);
  const amountRupees = roundRupees(input.amountRupees);
  const session = await mongoose.startSession();
  let withdrawalId = "";

  try {
    await session.withTransaction(async () => {
      const wallet = await Wallet.findOne({ creator: req.user!.id }).session(session);
      if (!wallet || wallet.availableRupees < amountRupees) throw new AppError(409, "Your available balance is too low");
      wallet.availableRupees = roundRupees(wallet.availableRupees - amountRupees);
      wallet.pendingRupees = roundRupees(wallet.pendingRupees + amountRupees);
      await wallet.save({ session });

      const [withdrawal] = await Withdrawal.create([{
        creator: req.user!.id,
        wallet: wallet._id,
        amountRupees,
        status: "PROCESSING",
      }], { session, ordered: true });
      withdrawalId = String(withdrawal!._id);
      await LedgerEntry.create([{
        creator: req.user!.id,
        wallet: wallet._id,
        type: "WITHDRAWAL_HOLD",
        amountRupees: -amountRupees,
        status: "PENDING",
        idempotencyKey: `withdrawal:${withdrawal!._id}:hold`,
        referenceType: "WITHDRAWAL",
        referenceId: withdrawal!._id,
        description: "Withdrawal requested",
      }], { session, ordered: true });
      await enqueueNotification({
        recipient: req.user!.id,
        event: "WITHDRAWAL_REQUESTED",
        message: "Your withdrawal request is being processed.",
        session,
      });
    });

    const withdrawal = await finishMockWithdrawal(withdrawalId, input.mockOutcome);
    res.status(201).json({ withdrawal });
  } finally { await session.endSession(); }
}

async function finishMockWithdrawal(withdrawalId: string, outcome: "SUCCESS" | "FAILURE") {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const withdrawal = await Withdrawal.findOne({ _id: withdrawalId, status: "PROCESSING" }).session(session);
      if (!withdrawal) throw new AppError(409, "Withdrawal has already been processed");
      const wallet = await Wallet.findById(withdrawal.wallet).session(session);
      if (!wallet || wallet.pendingRupees < withdrawal.amountRupees) throw new AppError(409, "Wallet balance is inconsistent");
      const hold = await LedgerEntry.findOne({ idempotencyKey: `withdrawal:${withdrawal._id}:hold` }).session(session);
      if (!hold) throw new AppError(409, "Withdrawal ledger entry is missing");

      wallet.pendingRupees = roundRupees(
        wallet.pendingRupees - withdrawal.amountRupees,
      );
      withdrawal.processedAt = new Date();
      if (outcome === "SUCCESS") {
        withdrawal.status = "SUCCEEDED";
        withdrawal.providerReference = `MOCK-${String(withdrawal._id).slice(-8).toUpperCase()}`;
        hold.status = "COMPLETED";
      } else {
        withdrawal.status = "FAILED";
        withdrawal.failureReason = "Mock provider declined the payout";
        wallet.availableRupees = roundRupees(
          wallet.availableRupees + withdrawal.amountRupees,
        );
        hold.status = "FAILED";
        await LedgerEntry.create([{
          creator: withdrawal.creator,
          wallet: wallet._id,
          type: "WITHDRAWAL_REVERSAL",
          amountRupees: withdrawal.amountRupees,
          status: "COMPLETED",
          idempotencyKey: `withdrawal:${withdrawal._id}:reversal`,
          referenceType: "WITHDRAWAL",
          referenceId: withdrawal._id,
          description: "Failed withdrawal returned to balance",
        }], { session, ordered: true });
      }
      await Promise.all([wallet.save({ session }), hold.save({ session }), withdrawal.save({ session })]);
      await enqueueNotification({
        recipient: withdrawal.creator,
        event: outcome === "SUCCESS" ? "WITHDRAWAL_SUCCEEDED" : "WITHDRAWAL_FAILED",
        message: outcome === "SUCCESS" ? "Your withdrawal was processed successfully." : "Your withdrawal failed and the amount was returned to your wallet.",
        session,
      });
      result = withdrawal;
    });
  } finally { await session.endSession(); }
  return result;
}
