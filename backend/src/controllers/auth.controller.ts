import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie, signToken } from "../lib/auth";
import { AppError } from "../lib/errors";
import { User } from "../models/User";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["BRAND", "CREATOR"]),
});

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password is required"),
});

function publicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  notificationPreferences: { email: boolean; whatsapp: boolean };
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    notificationPreferences: user.notificationPreferences,
  };
}

export async function signup(req: Request, res: Response) {
  const input = signupSchema.parse(req.body);
  const existingUser = await User.exists({ email: input.email });
  if (existingUser)
    throw new AppError(409, "An account with this email already exists");

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    role: input.role,
  });

  setSessionCookie(res, signToken({ id: String(user._id), role: user.role }));
  res.status(201).json({ user: publicUser(user) });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const user = await User.findOne({ email: input.email }).select(
    "+passwordHash",
  );

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, "Email or password is incorrect");
  }

  setSessionCookie(res, signToken({ id: String(user._id), role: user.role }));
  res.json({ user: publicUser(user) });
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError(401, "Account no longer exists");
  res.json({ user: publicUser(user) });
}
