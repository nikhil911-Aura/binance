import { prisma } from "./prisma";
import { fetchMarkPriceKlines } from "./binance";

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 1500; // Binance max per request

/** Delete records older than 30 days. */
async function cleanup() {
  const cutoff = new Date(Date.now() - ONE_MONTH_MS);
  await prisma.priceHistory.deleteMany({ where: { openTime: { lt: cutoff } } });
}

/** Fetch and store all 1m klines for a symbol from startMs to now, in batches. */
async function backfillSymbol(symbol: string, startMs: number): Promise<number> {
  let from = startMs;
  const now = Date.now();
  let totalInserted = 0;

  while (from < now) {
    const to = Math.min(from + BATCH_SIZE * 60 * 1000, now);
    let klines;
    try {
      klines = await fetchMarkPriceKlines(symbol, from, to, BATCH_SIZE);
    } catch (e) {
      console.error(`[priceHistory] fetch failed for ${symbol}:`, e);
      break;
    }
    if (klines.length === 0) break;

    await prisma.priceHistory.createMany({
      data: klines.map((k) => ({
        symbol,
        openTime: new Date(k.openTime),
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
      })),
      skipDuplicates: true,
    });

    totalInserted += klines.length;
    from = klines[klines.length - 1].openTime + 60_000;
  }

  return totalInserted;
}

/**
 * Sync price history for all tracked symbols.
 * - First run: backfills last 30 days
 * - Subsequent runs: fetches only new candles since last stored
 * - Always cleans up records older than 30 days
 */
export async function syncPriceHistory(): Promise<{ symbol: string; inserted: number }[]> {
  await cleanup();

  const symbols = await prisma.symbol.findMany({ select: { name: true } });
  const results: { symbol: string; inserted: number }[] = [];
  const oneMonthAgo = Date.now() - ONE_MONTH_MS;

  for (const { name } of symbols) {
    try {
      const latest = await prisma.priceHistory.findFirst({
        where: { symbol: name },
        orderBy: { openTime: "desc" },
        select: { openTime: true },
      });

      const startMs = latest
        ? Math.max(latest.openTime.getTime() + 60_000, oneMonthAgo)
        : oneMonthAgo;

      const inserted = await backfillSymbol(name, startMs);
      results.push({ symbol: name, inserted });
    } catch (e) {
      console.error(`[priceHistory] sync failed for ${name}:`, e);
      results.push({ symbol: name, inserted: 0 });
    }
  }

  return results;
}

/** Get paginated price history for a symbol within a time range. */
export async function getPriceHistory(
  symbol: string,
  from: Date,
  to: Date,
  page = 1,
  limit = 100,
) {
  const where = { symbol, openTime: { gte: from, lte: to } };
  const [total, rows] = await Promise.all([
    prisma.priceHistory.count({ where }),
    prisma.priceHistory.findMany({
      where,
      orderBy: { openTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { openTime: true, open: true, high: true, low: true, close: true, volume: true },
    }),
  ]);
  return { total, page, limit, totalPages: Math.ceil(total / limit), rows };
}
