import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../config/env";
import type { UserRole } from "../models/User";

interface TokenPayload {
  id: string;
  role: UserRole;
}

const COOKIE_NAME = "ugc_session";

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function setSessionCookie(res: Response, token: string) {
  const isProduction = env.NODE_ENV === "production";

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  const isProduction = env.NODE_ENV === "production";

  res.clearCookie(COOKIE_NAME, {
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}

export { COOKIE_NAME };
