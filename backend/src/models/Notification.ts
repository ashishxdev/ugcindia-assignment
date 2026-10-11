import { Schema, model, Types } from "mongoose";

export type NotificationChannel = "EMAIL" | "WHATSAPP";
export type NotificationStatus = "QUEUED" | "PROCESSING" | "SENT" | "FAILED";

export interface INotification {
  recipient: Types.ObjectId;
  event: string;
  channel: NotificationChannel;
  message: string;
  scheduledFor: Date;
  status: NotificationStatus;
  sentAt?: Date;
  attempts: number;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    event: { type: String, required: true },
    channel: { type: String, enum: ["EMAIL", "WHATSAPP"], required: true },
    message: { type: String, required: true, maxlength: 500 },
    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: ["QUEUED", "PROCESSING", "SENT", "FAILED"], default: "QUEUED", index: true },
    sentAt: Date,
    attempts: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

notificationSchema.index({ status: 1, scheduledFor: 1 });

export const Notification = model<INotification>("Notification", notificationSchema);
