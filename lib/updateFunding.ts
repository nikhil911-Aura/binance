import { prisma } from "./prisma";
import { fetchPremiumIndex } from "./binance";

const STALE_MS = 30_000; // refresh if older than 30 seconds

type SymbolLite = {
  id: string;
  name: string;
  updatedAt: Date;
  fundingRate: number | null;
};

/** Update one symbol from Binance. Returns true on success. */
async function updateOne(id: string, name: string): Promise<boolean> {
  const data = await fetchPremiumIndex(name);
  if (!data) return false;
  await prisma.symbol.update({
    where: { id },
    data: {
      fundingRate: data.fundingRate,
      nextFundingTime: data.nextFundingTime,
      fundingInterval: data.fundingInterval,
    },
  });
  return true;
}

/** Update all symbols (used by node-cron worker / cron endpoint). */
export async function updateAllSymbols() {
  const symbols = await prisma.symbol.findMany({ select: { id: true, name: true } });
  if (symbols.length === 0) return { updated: 0, failed: 0 };

  const results = await Promise.allSettled(
    symbols.map((s) => updateOne(s.id, s.name)),
  );
  const updated = results.filter(
    (r) => r.status === "fulfilled" && r.value === true,
  ).length;
  const failed = results.length - updated;
  console.log(`[update] all: updated=${updated} failed=${failed}`);
  return { updated, failed };
}

/**
 * On-demand refresh: only update symbols whose data is older than STALE_MS.
 * Runs refreshes in parallel; never throws (failures are logged + skipped).
 */
export async function refreshStaleSymbols(): Promise<void> {
  const now = Date.now();
  const symbols: SymbolLite[] = await prisma.symbol.findMany({
    select: { id: true, name: true, updatedAt: true, fundingRate: true },
  });

  const stale = symbols.filter(
    (s) => s.fundingRate === null || now - s.updatedAt.getTime() > STALE_MS,
  );
  if (stale.length === 0) return;

  await Promise.allSettled(stale.map((s) => updateOne(s.id, s.name)));
  console.log(`[update] on-demand refreshed ${stale.length}/${symbols.length}`);
}
