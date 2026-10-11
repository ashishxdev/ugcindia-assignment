import type { NextFunction, Request, Response } from "express";
import { COOKIE_NAME, verifyToken } from "../lib/auth";
import type { UserRole } from "../models/User";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies[COOKIE_NAME] as string | undefined;

  if (!token) {
    res.status(401).json({ message: "Please log in to continue" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Your session is invalid or expired" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res
        .status(403)
        .json({ message: "You do not have permission to perform this action" });
      return;
    }
    next();
  };
}
