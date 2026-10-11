import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database";
import { Campaign } from "../models/Campaign";
import { User } from "../models/User";
import { Wallet } from "../models/Wallet";

async function seedDemo() {
  await connectDatabase();
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);

  const brand = await User.findOneAndUpdate(
    { email: "brand.demo@ugcconnect.local" },
    {
      $set: {
        name: "Demo Brand",
        passwordHash,
        role: "BRAND",
        notificationPreferences: { email: true, whatsapp: true },
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  const creator = await User.findOneAndUpdate(
    { email: "creator.demo@ugcconnect.local" },
    {
      $set: {
        name: "Demo Creator",
        passwordHash,
        role: "CREATOR",
        notificationPreferences: { email: true, whatsapp: true },
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await Wallet.findOneAndUpdate(
    { creator: creator._id },
    { $setOnInsert: { creator: creator._id } },
    { upsert: true },
  );
  await Campaign.findOneAndUpdate(
    { brand: brand._id, title: "Everyday skincare stories" },
    {
      $setOnInsert: {
        brand: brand._id,
        title: "Everyday skincare stories",
        description:
          "Create an authentic Instagram reel showing how the product fits into your everyday skincare routine.",
        budgetRupees: 25_000,
        creatorFeeRupees: 5_000,
        slots: 5,
        applicationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        submissionDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  console.log("Demo data is ready.");
  console.log("Brand: brand.demo@ugcconnect.local / DemoPass123!");
  console.log("Creator: creator.demo@ugcconnect.local / DemoPass123!");
}

seedDemo()
  .catch((error) => {
    console.error("Unable to seed demo data", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
