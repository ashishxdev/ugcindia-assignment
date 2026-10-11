import type { ClientSession, Types } from "mongoose";
import { Notification } from "../models/Notification";
import { User } from "../models/User";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function nextAllowedNotificationTime(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const hour = ist.getUTCHours();
  if (hour >= 9 && hour < 21) return now;

  const target = new Date(ist);
  if (hour >= 21) target.setUTCDate(target.getUTCDate() + 1);
  target.setUTCHours(9, 0, 0, 0);
  return new Date(target.getTime() - IST_OFFSET_MS);
}

export async function enqueueNotification(input: {
  recipient: string | Types.ObjectId;
  event: string;
  message: string;
  session?: ClientSession;
}) {
  const query = User.findById(input.recipient).select("notificationPreferences");
  if (input.session) query.session(input.session);
  const user = await query;
  if (!user) return;

  const channels = [
    user.notificationPreferences.email ? "EMAIL" : null,
    user.notificationPreferences.whatsapp ? "WHATSAPP" : null,
  ].filter((channel): channel is "EMAIL" | "WHATSAPP" => Boolean(channel));

  if (!channels.length) return;
  const jobs = channels.map((channel) => ({
    recipient: input.recipient,
    event: input.event,
    channel,
    message: input.message,
    scheduledFor: nextAllowedNotificationTime(),
  }));
  await Notification.create(
    jobs,
    input.session ? { session: input.session, ordered: true } : undefined,
  );
}

export async function processDueNotifications() {
  while (true) {
    const job = await Notification.findOneAndUpdate(
      { status: "QUEUED", scheduledFor: { $lte: new Date() } },
      { $set: { status: "PROCESSING" }, $inc: { attempts: 1 } },
      { returnDocument: "after", sort: { scheduledFor: 1 } },
    );
    if (!job) break;

    try {
      console.log(`[mock ${job.channel.toLowerCase()}] ${job.message}`);
      job.status = "SENT";
      job.sentAt = new Date();
      await job.save();
    } catch {
      job.status = "FAILED";
      await job.save();
    }
  }
}
