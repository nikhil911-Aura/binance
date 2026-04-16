import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMarkPrice } from "@/lib/binanceTestnet";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/backfill-prices
 * Three passes:
 * 1. Fill null entryPrice with current mark price
 * 2. Fill null exitPrice (CLOSED orders) with current mark price
 * 3. Recalculate profit for CLOSED orders that have both prices but null profit
 */
export async function POST() {
  // Pass 1 — orders missing entryPrice
  const missingEntry = await prisma.order.findMany({
    where: { entryPrice: null },
    select: { id: true, symbol: true },
  });

  // Pass 2 — CLOSED orders missing exitPrice
  const missingExit = await prisma.order.findMany({
    where: { status: "CLOSED", exitPrice: null },
    select: { id: true, symbol: true, side: true, quantity: true, entryPrice: true },
  });

  // Pass 3 — CLOSED orders with both prices but no profit yet
  const missingProfit = await prisma.order.findMany({
    where: {
      status: "CLOSED",
      profit: null,
      NOT: { entryPrice: null },
      exitPrice: { not: null },
    },
    select: { id: true, symbol: true, side: true, quantity: true, entryPrice: true, exitPrice: true },
  });

  // Deduplicate symbols needed for price fetching (passes 1 & 2)
  const symbolsToFetch = new Set([
    ...missingEntry.map((o) => o.symbol),
    ...missingExit.map((o) => o.symbol),
  ]);

  const priceMap = new Map<string, number>();
  await Promise.allSettled(
    [...symbolsToFetch].map(async (sym) => {
      try {
        priceMap.set(sym, await getMarkPrice(sym));
      } catch {
        /* price unavailable — skip */
      }
    }),
  );

  let entryUpdated = 0;
  let exitUpdated = 0;
  let profitUpdated = 0;

  // Pass 1 — backfill entry prices
  await Promise.allSettled(
    missingEntry.map(async (o) => {
      const price = priceMap.get(o.symbol);
      if (!price) return;
      await prisma.order.update({ where: { id: o.id }, data: { entryPrice: price } });
      entryUpdated++;
    }),
  );

  // Pass 2 — backfill exit prices + profit
  await Promise.allSettled(
    missingExit.map(async (o) => {
      const exitPrice = priceMap.get(o.symbol);
      if (!exitPrice) return;
      const entryPrice = o.entryPrice ?? exitPrice; // use same price if entry also missing
      const profit =
        o.side === "BUY"
          ? (exitPrice - entryPrice) * o.quantity
          : (entryPrice - exitPrice) * o.quantity;
      await prisma.order.update({
        where: { id: o.id },
        data: { exitPrice, profit },
      });
      exitUpdated++;
    }),
  );

  // Pass 3 — recalculate profit where both prices exist but profit is null
  await Promise.allSettled(
    missingProfit.map(async (o) => {
      const entryPrice = o.entryPrice!;
      const exitPrice = o.exitPrice!;
      const profit =
        o.side === "BUY"
          ? (exitPrice - entryPrice) * o.quantity
          : (entryPrice - exitPrice) * o.quantity;
      await prisma.order.update({ where: { id: o.id }, data: { profit } });
      profitUpdated++;
    }),
  );

  return NextResponse.json({
    message: `Backfilled ${entryUpdated} entry, ${exitUpdated} exit, ${profitUpdated} profit`,
    symbolsFetched: symbolsToFetch.size,
    pricesRetrieved: priceMap.size,
  });
}
