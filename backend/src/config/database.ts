import mongoose from "mongoose";
import { env } from "./env";

let connectionPromise: ReturnType<typeof mongoose.connect> | null = null;

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.MONGODB_URI).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  await connectionPromise;
}
