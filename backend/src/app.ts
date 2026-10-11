import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error";
import { applicationRouter } from "./routes/application.routes";
import { authRouter } from "./routes/auth.routes";
import { campaignRouter } from "./routes/campaign.routes";
import { notificationRouter } from "./routes/notification.routes";
import { submissionRouter } from "./routes/submission.routes";
import { walletRouter } from "./routes/wallet.routes";

export const app = express();
const configuredFrontendOrigin = env.FRONTEND_URL.replace(/\/+$/, "");

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || origin === configuredFrontendOrigin) {
        callback(null, true);
        return;
      }

      const isLocalDevelopmentOrigin =
        env.NODE_ENV === "development" &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

      callback(
        isLocalDevelopmentOrigin ? null : new Error(`Origin ${origin} is not allowed`),
        isLocalDevelopmentOrigin,
      );
    },
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/applications", applicationRouter);
app.use("/api/submissions", submissionRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/notifications", notificationRouter);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

export default app;
