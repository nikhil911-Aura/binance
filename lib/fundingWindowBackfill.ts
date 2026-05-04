import { prisma } from "./prisma";
import { fetchMarkPriceKlines1s } from "./binance";

const LOOKBACK_MS = 2 * 60 * 60 * 1000; // look back 2 hours

export async function backfillFundingWindows(): Promise<void> {
  const now = Date.now();
  const windowClosed = new Date(now - 60_000);
  const lookback = new Date(now - LOOKBACK_MS);

  const [withSnapshots, withKlines] = await Promise.all([
    prisma.fundingWindowPrice.groupBy({
      by: ["symbol", "fundingTime"],
      where: {
        source: "snapshot",
        fundingTime: { lt: windowClosed, gt: lookback },
      },
    }),
    prisma.fundingWindowPrice.groupBy({
      by: ["symbol", "fundingTime"],
      where: {
        source: "kline",
        fundingTime: { gt: lookback },
      },
    }),
  ]);

  const backfilledKeys = new Set(
    withKlines.map((k) => `${k.symbol}_${k.fundingTime.toISOString()}`)
  );

  const toBackfill = withSnapshots.filter(
    (s) => !backfilledKeys.has(`${s.symbol}_${s.fundingTime.toISOString()}`)
  );

  if (toBackfill.length === 0) return;

  for (const event of toBackfill) {
    const fundingMs = event.fundingTime.getTime();
    const klines = await fetchMarkPriceKlines1s(
      event.symbol,
      fundingMs - 60_000,
      fundingMs + 60_000,
    );
    if (klines.length === 0) continue;

    const snapshot = await prisma.fundingWindowPrice.findFirst({
      where: { symbol: event.symbol, fundingTime: event.fundingTime, source: "snapshot" },
      select: { fundingRate: true },
    });

    const fundingRate = snapshot?.fundingRate ?? 0;

    const creates = klines.map((k) => ({
      symbol: event.symbol,
      price: k.price,
      recordedAt: new Date(k.time),
      fundingTime: event.fundingTime,
      fundingRate,
      phase: k.time < fundingMs ? "before" : "after",
      source: "kline",
    }));

    await prisma.fundingWindowPrice.createMany({ data: creates });
    console.log(`[backfill] ${event.symbol} @ ${event.fundingTime.toISOString()}: inserted ${creates.length} kline points`);
  }
}
