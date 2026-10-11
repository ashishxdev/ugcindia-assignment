import { Schema, model, Types } from "mongoose";

export type LedgerEntryType = "PAYOUT_CREDIT" | "WITHDRAWAL_HOLD" | "WITHDRAWAL_REVERSAL";
export type LedgerEntryStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface ILedgerEntry {
  creator: Types.ObjectId;
  wallet: Types.ObjectId;
  type: LedgerEntryType;
  amountRupees: number;
  status: LedgerEntryStatus;
  idempotencyKey: string;
  referenceType: "SUBMISSION" | "WITHDRAWAL";
  referenceId: Types.ObjectId;
  description: string;
  breakdown?: {
    grossRupees: number;
    platformFeeRupees: number;
    gstRupees: number;
    tdsRupees: number;
    netRupees: number;
  };
}

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    wallet: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    type: { type: String, enum: ["PAYOUT_CREDIT", "WITHDRAWAL_HOLD", "WITHDRAWAL_REVERSAL"], required: true },
    amountRupees: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    referenceType: { type: String, enum: ["SUBMISSION", "WITHDRAWAL"], required: true },
    referenceId: { type: Schema.Types.ObjectId, required: true },
    description: { type: String, required: true },
    breakdown: {
      grossRupees: Number,
      platformFeeRupees: Number,
      gstRupees: Number,
      tdsRupees: Number,
      netRupees: Number,
    },
  },
  { timestamps: true },
);

ledgerEntrySchema.index({ creator: 1, createdAt: -1 });

export const LedgerEntry = model<ILedgerEntry>("LedgerEntry", ledgerEntrySchema);
