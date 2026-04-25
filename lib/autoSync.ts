import { prisma } from "./prisma";
import { fetchAllPremiumData } from "./binance";
import { loadFundingIntervals } from "./binanceMeta";

const THRESHOLD = 0.03; // 3%
const SYNC_INTERVAL_MS = 30_000;
let lastSyncMs = 0;

/**
 * Scans all Binance futures symbols every 30 seconds.
 * Auto-adds symbols with |fundingRate| >= 3% (marked isFavorite: false).
 * Auto-removes non-favorite symbols whose rate drops below 3%.
 * User-added symbols (isFavorite: true) are never touched.
 */
export async function autoSyncSymbols(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncMs < SYNC_INTERVAL_MS) return;
  lastSyncMs = now;

  const [allData, intervals] = await Promise.all([
    fetchAllPremiumData(),
    loadFundingIntervals(),
  ]);

  const dbSymbols = await prisma.symbol.findMany({
    select: { id: true, name: true, isFavorite: true },
  });
  const dbMap = new Map(dbSymbols.map((s) => [s.name, s]));

  // Auto-add: high-rate symbols not yet in DB
  const toAdd: Array<{
    name: string;
    fundingRate: number;
    nextFundingTime: Date;
    fundingInterval: number;
    isFavorite: boolean;
  }> = [];

  for (const [name, data] of allData) {
    if (Math.abs(data.fundingRate) >= THRESHOLD && !dbMap.has(name)) {
      toAdd.push({
        name,
        fundingRate: data.fundingRate,
        nextFundingTime: data.nextFundingTime,
        fundingInterval: intervals.get(name) ?? 8,
        isFavorite: false,
      });
    }
  }

  // Auto-remove: non-favorites whose rate dropped below threshold
  const toRemoveIds = dbSymbols
    .filter((s) => {
      if (s.isFavorite) return false;
      const d = allData.get(s.name);
      if (!d) return false; // symbol gone from Binance — leave it, don't auto-remove
      return Math.abs(d.fundingRate) < THRESHOLD;
    })
    .map((s) => s.id);

  if (toAdd.length > 0) {
    await prisma.symbol.createMany({ data: toAdd, skipDuplicates: true });
    console.log(`[auto-sync] Added: ${toAdd.map((s) => s.name).join(", ")}`);
  }
  if (toRemoveIds.length > 0) {
    await prisma.symbol.deleteMany({ where: { id: { in: toRemoveIds } } });
    console.log(`[auto-sync] Removed ${toRemoveIds.length} auto-added symbol(s)`);
  }
}
