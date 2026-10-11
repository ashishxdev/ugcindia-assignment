import { Schema, model, Types } from "mongoose";

export type CampaignStatus = "ACTIVE" | "CANCELLED" | "COMPLETED";

export interface ICampaign {
  brand: Types.ObjectId;
  title: string;
  description: string;
  budgetRupees: number;
  creatorFeeRupees: number;
  slots: number;
  approvedCount: number;
  reservedRupees: number;
  spentRupees: number;
  applicationDeadline: Date;
  submissionDeadline: Date;
  status: CampaignStatus;
}

const campaignSchema = new Schema<ICampaign>(
  {
    brand: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 1200 },
    budgetRupees: { type: Number, required: true, min: 1 },
    creatorFeeRupees: { type: Number, required: true, min: 1 },
    slots: { type: Number, required: true, min: 1 },
    approvedCount: { type: Number, required: true, default: 0, min: 0 },
    reservedRupees: { type: Number, required: true, default: 0, min: 0 },
    spentRupees: { type: Number, required: true, default: 0, min: 0 },
    applicationDeadline: { type: Date, required: true },
    submissionDeadline: { type: Date, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED", "COMPLETED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, applicationDeadline: 1 });

export const Campaign = model<ICampaign>("Campaign", campaignSchema);
