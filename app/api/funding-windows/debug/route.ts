import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllMarkPrices } from "@/lib/binance";

export const dynamic = "force-dynamic";

// Debug endpoint — shows what recordIfInWindow() sees right now
export async function GET() {
  const RATE_THRESHOLD = 0.03;
  const WINDOW_MS = 60_000;
  const now = new Date();
  const nowMs = now.getTime();

  const symbols = await prisma.symbol.findMany({
    select: { name: true, fundingRate: true, nextFundingTime: true },
  });

  const prices = await fetchAllMarkPrices();

  const debug = symbols.map((s) => {
    const diff = s.nextFundingTime ? s.nextFundingTime.getTime() - nowMs : null;
    const inWindow = diff != null && diff > -WINDOW_MS && diff <= WINDOW_MS;
    const qualifiesRate = s.fundingRate != null && Math.abs(s.fundingRate) >= RATE_THRESHOLD;
    return {
      symbol: s.name,
      fundingRate: s.fundingRate,
      nextFundingTime: s.nextFundingTime,
      secondsToFunding: diff != null ? Math.round(diff / 1000) : null,
      inWindow,
      qualifiesRate,
      willRecord: inWindow && qualifiesRate,
      currentPrice: prices.get(s.name) ?? null,
    };
  });

  const rowCount = await prisma.fundingWindowPrice.count();

  return NextResponse.json({
    serverTime: now.toISOString(),
    totalTrackedSymbols: symbols.length,
    totalRecordedRows: rowCount,
    symbols: debug,
  });
}
