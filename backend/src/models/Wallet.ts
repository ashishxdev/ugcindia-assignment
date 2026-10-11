import { Schema, model, Types } from "mongoose";

export interface IWallet {
  creator: Types.ObjectId;
  availableRupees: number;
  pendingRupees: number;
  lifetimeEarnedRupees: number;
}

const walletSchema = new Schema<IWallet>(
  {
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    availableRupees: { type: Number, required: true, default: 0, min: 0 },
    pendingRupees: { type: Number, required: true, default: 0, min: 0 },
    lifetimeEarnedRupees: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const Wallet = model<IWallet>("Wallet", walletSchema);
