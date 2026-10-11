import type { Request, Response } from "express";
import { z } from "zod";
import { Notification } from "../models/Notification";
import { User } from "../models/User";

const preferencesSchema = z.object({ email: z.boolean(), whatsapp: z.boolean() });

export async function myNotifications(req: Request, res: Response) {
  const notifications = await Notification.find({ recipient: req.user!.id }).sort({ createdAt: -1 }).limit(50);
  res.json({ notifications });
}

export async function updatePreferences(req: Request, res: Response) {
  const preferences = preferencesSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { notificationPreferences: preferences } },
    { returnDocument: "after" },
  );
  res.json({ preferences: user!.notificationPreferences });
}
