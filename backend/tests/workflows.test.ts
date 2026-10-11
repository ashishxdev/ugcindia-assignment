import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { signToken } from "../src/lib/auth";
import { Application } from "../src/models/Application";
import { Campaign } from "../src/models/Campaign";
import { LedgerEntry } from "../src/models/LedgerEntry";
import { Notification } from "../src/models/Notification";
import { Submission } from "../src/models/Submission";
import { User, type UserRole } from "../src/models/User";
import { Wallet } from "../src/models/Wallet";
import { Withdrawal } from "../src/models/Withdrawal";
import {
  enqueueNotification,
  nextAllowedNotificationTime,
} from "../src/services/notification.service";

let replicaSet: MongoMemoryReplSet;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri(), { dbName: "ugc-test" });
  await mongoose.syncIndexes();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
});

async function createUser(role: UserRole, suffix: string) {
  return User.create({
    name: `${role} ${suffix}`,
    email: `${role.toLowerCase()}-${suffix}@example.com`,
    passwordHash: "not-used-by-integration-tests",
    role,
  });
}

function authCookie(user: { _id: unknown; role: UserRole }) {
  return `ugc_session=${signToken({ id: String(user._id), role: user.role })}`;
}

async function createCampaign(
  brandId: unknown,
  overrides: Record<string, unknown> = {},
) {
  return Campaign.create({
    brand: brandId,
    title: "Autumn creator campaign",
    description: "Create a short Instagram video demonstrating the product.",
    budgetRupees: 10_000,
    creatorFeeRupees: 5_000,
    slots: 2,
    applicationDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    submissionDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
    ...overrides,
  });
}

describe("campaign reservation", () => {
  it("does not overspend a single slot during concurrent approvals", async () => {
    const brand = await createUser("BRAND", "reservation");
    const creatorOne = await createUser("CREATOR", "one");
    const creatorTwo = await createUser("CREATOR", "two");
    const campaign = await createCampaign(brand._id, {
      budgetRupees: 5_000,
      slots: 1,
    });
    const [applicationOne, applicationTwo] = await Application.create([
      { campaign: campaign._id, creator: creatorOne._id },
      { campaign: campaign._id, creator: creatorTwo._id },
    ]);

    const responses = await Promise.all([
      request(app)
        .patch(`/api/applications/${applicationOne!._id}/approve`)
        .set("Cookie", authCookie(brand)),
      request(app)
        .patch(`/api/applications/${applicationTwo!._id}/approve`)
        .set("Cookie", authCookie(brand)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const storedCampaign = await Campaign.findById(campaign._id);
    expect(storedCampaign?.approvedCount).toBe(1);
    expect(storedCampaign?.reservedRupees).toBe(5_000);
    expect(await Application.countDocuments({ status: "APPROVED" })).toBe(1);
  });
});

describe("submission payout", () => {
  it("calculates the payout and cannot credit the same submission twice", async () => {
    const brand = await createUser("BRAND", "payout");
    const creator = await createUser("CREATOR", "payout");
    const campaign = await createCampaign(brand._id, {
      approvedCount: 1,
      reservedRupees: 5_000,
    });
    const application = await Application.create({
      campaign: campaign._id,
      creator: creator._id,
      status: "APPROVED",
    });
    const submission = await Submission.create({
      application: application._id,
      campaign: campaign._id,
      creator: creator._id,
      url: "https://www.instagram.com/p/payout-test/",
      versions: [
        {
          url: "https://www.instagram.com/p/payout-test/",
          submittedAt: new Date(),
        },
      ],
    });

    const firstApproval = await request(app)
      .patch(`/api/submissions/${submission._id}/approve`)
      .set("Cookie", authCookie(brand));
    const duplicateApproval = await request(app)
      .patch(`/api/submissions/${submission._id}/approve`)
      .set("Cookie", authCookie(brand));

    expect(firstApproval.status).toBe(200);
    expect(firstApproval.body.payout).toEqual({
      grossRupees: 5_000,
      platformFeeRupees: 500,
      gstRupees: 90,
      tdsRupees: 50,
      netRupees: 4_360,
    });
    expect(duplicateApproval.status).toBe(409);
    expect(
      (await Wallet.findOne({ creator: creator._id }))?.availableRupees,
    ).toBe(4_360);
    expect(await LedgerEntry.countDocuments({ type: "PAYOUT_CREDIT" })).toBe(1);
  });
});

describe("withdrawal accounting", () => {
  it("restores available money when the mock provider fails", async () => {
    const creator = await createUser("CREATOR", "withdrawal");
    await Wallet.create({ creator: creator._id, availableRupees: 1_000 });

    const response = await request(app)
      .post("/api/wallet/withdrawals")
      .set("Cookie", authCookie(creator))
      .send({ amountRupees: 400, mockOutcome: "FAILURE" });

    expect(response.status).toBe(201);
    expect(response.body.withdrawal.status).toBe("FAILED");
    const wallet = await Wallet.findOne({ creator: creator._id });
    expect(wallet?.availableRupees).toBe(1_000);
    expect(wallet?.pendingRupees).toBe(0);
    expect(await Withdrawal.countDocuments({ status: "FAILED" })).toBe(1);
    expect(
      await LedgerEntry.findOne({ type: "WITHDRAWAL_HOLD" }),
    ).toMatchObject({
      amountRupees: -400,
      status: "FAILED",
    });
    expect(
      await LedgerEntry.findOne({ type: "WITHDRAWAL_REVERSAL" }),
    ).toMatchObject({
      amountRupees: 400,
      status: "COMPLETED",
    });
  });
});

describe("notifications and workflow limits", () => {
  it("holds quiet-hour notifications until 9 AM IST and respects channel preferences", async () => {
    const atNineThirtyPmIst = new Date("2026-10-11T16:00:00.000Z");
    expect(nextAllowedNotificationTime(atNineThirtyPmIst).toISOString()).toBe(
      "2026-10-12T03:30:00.000Z",
    );

    const creator = await User.create({
      name: "Quiet Hours Creator",
      email: "quiet@example.com",
      passwordHash: "not-used-by-integration-tests",
      role: "CREATOR",
      notificationPreferences: { email: false, whatsapp: true },
    });
    await enqueueNotification({
      recipient: creator._id,
      event: "TEST_EVENT",
      message: "Test notification",
    });

    const jobs = await Notification.find({ recipient: creator._id });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.channel).toBe("WHATSAPP");
  });

  it("enforces the two-revision limit", async () => {
    const brand = await createUser("BRAND", "revision");
    const creator = await createUser("CREATOR", "revision");
    const campaign = await createCampaign(brand._id);
    const application = await Application.create({
      campaign: campaign._id,
      creator: creator._id,
      status: "APPROVED",
    });
    const submission = await Submission.create({
      application: application._id,
      campaign: campaign._id,
      creator: creator._id,
      url: "https://www.instagram.com/p/revision-test/",
      revisionCount: 2,
      versions: [
        {
          url: "https://www.instagram.com/p/revision-test/",
          submittedAt: new Date(),
        },
      ],
    });

    const response = await request(app)
      .patch(`/api/submissions/${submission._id}/revision`)
      .set("Cookie", authCookie(brand))
      .send({ feedback: "Please revise this again" });

    expect(response.status).toBe(409);
  });

  it("prevents a different brand from reviewing a submission", async () => {
    const owner = await createUser("BRAND", "owner");
    const otherBrand = await createUser("BRAND", "other");
    const creator = await createUser("CREATOR", "authorization");
    const campaign = await createCampaign(owner._id, {
      approvedCount: 1,
      reservedRupees: 5_000,
    });
    const application = await Application.create({
      campaign: campaign._id,
      creator: creator._id,
      status: "APPROVED",
    });
    const submission = await Submission.create({
      application: application._id,
      campaign: campaign._id,
      creator: creator._id,
      url: "https://www.instagram.com/p/authorization-test/",
      versions: [
        {
          url: "https://www.instagram.com/p/authorization-test/",
          submittedAt: new Date(),
        },
      ],
    });

    const response = await request(app)
      .patch(`/api/submissions/${submission._id}/approve`)
      .set("Cookie", authCookie(otherBrand));

    expect(response.status).toBe(403);
    expect((await Submission.findById(submission._id))?.status).toBe(
      "SUBMITTED",
    );
    expect(await LedgerEntry.countDocuments()).toBe(0);
  });
});

describe("campaign cancellation", () => {
  it("closes pending applications but lets selected creators submit", async () => {
    const brand = await createUser("BRAND", "cancel");
    const selectedCreator = await createUser("CREATOR", "selected");
    const pendingCreator = await createUser("CREATOR", "pending");
    const campaign = await createCampaign(brand._id, {
      approvedCount: 1,
      reservedRupees: 5_000,
    });
    const selectedApplication = await Application.create({
      campaign: campaign._id,
      creator: selectedCreator._id,
      status: "APPROVED",
    });
    const pendingApplication = await Application.create({
      campaign: campaign._id,
      creator: pendingCreator._id,
    });

    const cancellation = await request(app)
      .patch(`/api/campaigns/${campaign._id}/cancel`)
      .set("Cookie", authCookie(brand));
    const submission = await request(app)
      .post("/api/submissions")
      .set("Cookie", authCookie(selectedCreator))
      .send({
        applicationId: String(selectedApplication._id),
        url: "https://www.instagram.com/p/cancelled-campaign-work/",
      });

    expect(cancellation.status).toBe(200);
    expect(cancellation.body.closedApplications).toBe(1);
    expect((await Campaign.findById(campaign._id))?.status).toBe("CANCELLED");
    expect((await Application.findById(pendingApplication._id))?.status).toBe(
      "REJECTED",
    );
    expect((await Application.findById(selectedApplication._id))?.status).toBe(
      "APPROVED",
    );
    expect(submission.status).toBe(201);
  });

  it("archives an already-paid cancelled campaign as completed", async () => {
    const brand = await createUser("BRAND", "paid-cancel");
    const creator = await createUser("CREATOR", "paid-cancel");
    const campaign = await createCampaign(brand._id, {
      approvedCount: 1,
      reservedRupees: 0,
      spentRupees: 5_000,
      slots: 1,
    });
    await Application.create({
      campaign: campaign._id,
      creator: creator._id,
      status: "APPROVED",
    });

    const response = await request(app)
      .patch(`/api/campaigns/${campaign._id}/cancel`)
      .set("Cookie", authCookie(brand));

    expect(response.status).toBe(200);
    expect(response.body.campaign.status).toBe("COMPLETED");
    expect((await Campaign.findById(campaign._id))?.status).toBe("COMPLETED");
  });
});
