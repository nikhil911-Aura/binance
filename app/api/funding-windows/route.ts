import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/funding-windows
//   → list of recent funding events (grouped by symbol + fundingTime)
//
// GET /api/funding-windows?symbol=BTCUSDT&fundingTime=<ISO>
//   → all 1-second price points for that specific event
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const fundingTimeStr = searchParams.get("fundingTime");

  // Return price points for a specific event
  if (symbol && fundingTimeStr) {
    const fundingTime = new Date(fundingTimeStr);
    if (isNaN(fundingTime.getTime())) {
      return NextResponse.json({ error: "Invalid fundingTime" }, { status: 400 });
    }
    const rows = await prisma.fundingWindowPrice.findMany({
      where: { symbol, fundingTime },
      orderBy: { recordedAt: "asc" },
      select: { price: true, recordedAt: true, phase: true },
    });
    return NextResponse.json(rows);
  }

  // Return list of recent funding events grouped by symbol + fundingTime only
  const events = await prisma.fundingWindowPrice.groupBy({
    by: ["symbol", "fundingTime"],
    where: symbol ? { symbol } : {},
    _count: { id: true },
    _min: { price: true, fundingRate: true },
    _max: { price: true },
    orderBy: { fundingTime: "desc" },
    take: 100,
  });

  return NextResponse.json(
    events.map((e) => ({
      symbol: e.symbol,
      fundingTime: e.fundingTime,
      fundingRate: e._min.fundingRate,
      dataPoints: e._count.id,
      minPrice: e._min.price,
      maxPrice: e._max.price,
    }))
  );
}
