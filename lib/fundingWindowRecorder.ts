import { prisma } from "./prisma";
import { fetchAllMarkPrices } from "./binance";

const RATE_THRESHOLD = 0.03; // 3%
const WINDOW_MS = 60_000;    // 1 min before + 1 min after

/**
 * Stateless check — called on every mark-price poll (every ~2s from the client).
 * Finds qualifying symbols inside their funding window and writes a price snapshot.
 * Works on Vercel serverless with no persistent state or cron job required.
 */
export async function recordIfInWindow(): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();

  const symbols = await prisma.symbol.findMany({
    select: { name: true, fundingRate: true, nextFundingTime: true },
    where: {
      nextFundingTime: { not: null },
      OR: [
        { fundingRate: { gte: RATE_THRESHOLD } },
        { fundingRate: { lte: -RATE_THRESHOLD } },
      ],
    },
  });

  const qualifying = symbols.filter((s) => {
    if (!s.nextFundingTime) return false;
    const diff = s.nextFundingTime.getTime() - nowMs;
    return diff > -WINDOW_MS && diff <= WINDOW_MS;
  });

  if (qualifying.length === 0) return;

  const prices = await fetchAllMarkPrices();

  const creates = qualifying
    .filter((s) => prices.has(s.name) && s.fundingRate != null)
    .map((s) => ({
      symbol: s.name,
      price: prices.get(s.name)!,
      recordedAt: now,
      fundingTime: s.nextFundingTime!,
      fundingRate: s.fundingRate!,
      phase: nowMs < s.nextFundingTime!.getTime() ? "before" : "after",
    }));

  if (creates.length > 0) {
    await prisma.fundingWindowPrice.createMany({ data: creates });
    console.log(`[funding-window] Recorded ${creates.length} snapshot(s) at ${now.toISOString()}`);
  }
}
