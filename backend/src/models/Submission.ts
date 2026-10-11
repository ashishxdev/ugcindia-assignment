import { Schema, model, Types } from "mongoose";

export type SubmissionStatus = "SUBMITTED" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";

interface SubmissionVersion {
  url: string;
  submittedAt: Date;
}

export interface ISubmission {
  application: Types.ObjectId;
  campaign: Types.ObjectId;
  creator: Types.ObjectId;
  url: string;
  status: SubmissionStatus;
  revisionCount: number;
  feedback?: string;
  versions: SubmissionVersion[];
  paidAt?: Date;
}

const versionSchema = new Schema<SubmissionVersion>(
  {
    url: { type: String, required: true },
    submittedAt: { type: Date, required: true },
  },
  { _id: false },
);

const submissionSchema = new Schema<ISubmission>(
  {
    application: { type: Schema.Types.ObjectId, ref: "Application", required: true, unique: true },
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    url: { type: String, required: true },
    status: {
      type: String,
      enum: ["SUBMITTED", "REVISION_REQUESTED", "APPROVED", "REJECTED"],
      required: true,
      default: "SUBMITTED",
      index: true,
    },
    revisionCount: { type: Number, required: true, default: 0, min: 0, max: 2 },
    feedback: { type: String, trim: true, maxlength: 1000 },
    versions: { type: [versionSchema], required: true, default: [] },
    paidAt: Date,
  },
  { timestamps: true },
);

export const Submission = model<ISubmission>("Submission", submissionSchema);
