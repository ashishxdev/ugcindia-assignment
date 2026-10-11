import { Schema, model, Types } from "mongoose";

export type WithdrawalStatus = "PROCESSING" | "SUCCEEDED" | "FAILED";

export interface IWithdrawal {
  creator: Types.ObjectId;
  wallet: Types.ObjectId;
  amountRupees: number;
  status: WithdrawalStatus;
  providerReference?: string;
  failureReason?: string;
  processedAt?: Date;
}

const withdrawalSchema = new Schema<IWithdrawal>(
  {
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    wallet: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    amountRupees: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["PROCESSING", "SUCCEEDED", "FAILED"], required: true, index: true },
    providerReference: String,
    failureReason: String,
    processedAt: Date,
  },
  { timestamps: true },
);

export const Withdrawal = model<IWithdrawal>("Withdrawal", withdrawalSchema);
