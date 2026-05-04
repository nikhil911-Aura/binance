import { prisma } from "./prisma";
import { fetchAllPremiumData } from "./binance";
import { loadFundingIntervals } from "./binanceMeta";
import { getSettings } from "./settings";

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
let lastSyncMs = 0;

/**
 * Scans all Binance futures symbols every 30 minutes.
 * Threshold is read from settings (configurable via Settings page).
 * Auto-adds symbols with |fundingRate| >= threshold (marked isFavorite: false).
 * Auto-removes non-favorite symbols whose rate drops below threshold.
 * User-added symbols (isFavorite: true) are never touched.
 */
export function resetAutoSyncTimer(): void {
  lastSyncMs = 0;
}

export async function autoSyncSymbols(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncMs < SYNC_INTERVAL_MS) return;
  lastSyncMs = now;

  const [{ fundingRateThreshold: threshold }, allData, intervals] = await Promise.all([
    getSettings(),
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
    if (Math.abs(data.fundingRate) >= threshold && !dbMap.has(name)) {
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
      if (!d) return false;
      return Math.abs(d.fundingRate) < threshold;
    })
    .map((s) => s.id);

  if (toAdd.length > 0) {
    await prisma.symbol.createMany({ data: toAdd, skipDuplicates: true });
    console.log(`[auto-sync] Added: ${toAdd.map((s) => s.name).join(", ")} (threshold=${(threshold * 100).toFixed(2)}%)`);
  }
  if (toRemoveIds.length > 0) {
    await prisma.symbol.deleteMany({ where: { id: { in: toRemoveIds } } });
    console.log(`[auto-sync] Removed ${toRemoveIds.length} auto-added symbol(s)`);
  }
}
