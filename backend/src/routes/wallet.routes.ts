import { Router } from "express";
import { getWallet, requestWithdrawal } from "../controllers/wallet.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const walletRouter = Router();
walletRouter.use(requireAuth, requireRole("CREATOR"));
walletRouter.get("/", getWallet);
walletRouter.post("/withdrawals", requestWithdrawal);
