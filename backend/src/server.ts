import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { processDueNotifications } from "./services/notification.service";

async function start() {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.log(`API running on http://localhost:${env.PORT}`);
  });
  void processDueNotifications();
  setInterval(() => void processDueNotifications(), 30_000);
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});