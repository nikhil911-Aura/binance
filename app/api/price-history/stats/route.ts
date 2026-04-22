import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();
  const where = { symbol, openTime: { gte: fromDate, lte: toDate } };

  const [agg, first] = await Promise.all([
    prisma.priceHistory.aggregate({
      where,
      _max: { high: true },
      _min: { low: true },
    }),
    prisma.priceHistory.findFirst({
      where,
      orderBy: { openTime: "asc" },
      select: { close: true },
    }),
  ]);

  return NextResponse.json({
    high: agg._max.high,
    low: agg._min.low,
    firstClose: first?.close ?? null,
  });
}
