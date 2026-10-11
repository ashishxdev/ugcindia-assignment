import { Schema, model, Types } from "mongoose";

export type ApplicationStatus =
  | "APPLIED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export interface IApplication {
  campaign: Types.ObjectId;
  creator: Types.ObjectId;
  status: ApplicationStatus;
  note?: string;
  withdrawnAt?: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    campaign: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["APPLIED", "APPROVED", "REJECTED", "WITHDRAWN"],
      default: "APPLIED",
      index: true,
    },
    note: { type: String, trim: true, maxlength: 500 },
    withdrawnAt: Date,
  },
  { timestamps: true },
);

applicationSchema.index({ campaign: 1, creator: 1 }, { unique: true });

export const Application = model<IApplication>(
  "Application",
  applicationSchema,
);
