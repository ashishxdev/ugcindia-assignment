import { Schema, model } from "mongoose";

export type UserRole = "BRAND" | "CREATOR";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  notificationPreferences: {
    email: boolean;
    whatsapp: boolean;
  };
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["BRAND", "CREATOR"], required: true },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export const User = model<IUser>("User", userSchema);
