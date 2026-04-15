import cron from "node-cron";
import { updateAllSymbols } from "./updateFunding";

console.log("[cron] starting funding-rate updater (every minute)");

cron.schedule("* * * * *", async () => {
  try {
    await updateAllSymbols();
  } catch (err) {
    console.error("[cron] tick failed:", err);
  }
});

updateAllSymbols().catch((e) => console.error("[cron] initial run:", e));
