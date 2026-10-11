export type Role = "BRAND" | "CREATOR";
export type ApplicationStatus = "APPLIED" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  notificationPreferences: { email: boolean; whatsapp: boolean };
}

export interface Campaign {
  _id: string;
  brand: { _id: string; name: string } | string;
  title: string;
  description: string;
  budgetRupees: number;
  creatorFeeRupees: number;
  slots: number;
  approvedCount: number;
  reservedRupees: number;
  spentRupees: number;
  applicationDeadline: string;
  submissionDeadline: string;
  status: "ACTIVE" | "CANCELLED" | "COMPLETED";
  collaborationStats?: {
    selectedCount: number;
    activeCount: number;
    paidCount: number;
    rejectedCount: number;
    currentCount: number;
  };
}

export type SubmissionStatus = "SUBMITTED" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";

export interface Submission {
  _id: string;
  application: { _id: string; status: ApplicationStatus } | string;
  campaign: Pick<Campaign, "_id" | "title" | "creatorFeeRupees" | "submissionDeadline"> | string;
  creator: { _id: string; name: string; email: string } | string;
  url: string;
  status: SubmissionStatus;
  revisionCount: number;
  feedback?: string;
  versions: { url: string; submittedAt: string }[];
  paidAt?: string;
  updatedAt: string;
}

export interface Wallet {
  _id: string;
  availableRupees: number;
  pendingRupees: number;
  lifetimeEarnedRupees: number;
}

export interface LedgerEntry {
  _id: string;
  type: "PAYOUT_CREDIT" | "WITHDRAWAL_HOLD" | "WITHDRAWAL_REVERSAL";
  amountRupees: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
  description: string;
  breakdown?: {
    grossRupees: number;
    platformFeeRupees: number;
    gstRupees: number;
    tdsRupees: number;
    netRupees: number;
  };
  createdAt: string;
}

export interface Withdrawal {
  _id: string;
  amountRupees: number;
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  providerReference?: string;
  failureReason?: string;
  createdAt: string;
}

export interface Application {
  _id: string;
  campaign: Campaign | string;
  creator: { _id: string; name: string; email: string } | string;
  status: ApplicationStatus;
  note?: string;
  createdAt: string;
}
