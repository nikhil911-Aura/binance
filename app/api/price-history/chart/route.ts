import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_POINTS = 500;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();

  const total = await prisma.priceHistory.count({
    where: { symbol, openTime: { gte: fromDate, lte: toDate } },
  });
  if (total === 0) return NextResponse.json([]);

  const step = Math.max(1, Math.floor(total / MAX_POINTS));

  // Sample evenly at DB level using ROW_NUMBER — never loads full dataset into memory
  const rows = await prisma.$queryRaw<{ openTime: Date; close: number }[]>`
    SELECT "openTime", close FROM (
      SELECT "openTime", close,
             ROW_NUMBER() OVER (ORDER BY "openTime" ASC) AS rn
      FROM "PriceHistory"
      WHERE symbol = ${symbol}
        AND "openTime" >= ${fromDate}
        AND "openTime" <= ${toDate}
    ) t
    WHERE rn % ${step} = 0
    ORDER BY "openTime" ASC
  `;

  return NextResponse.json(rows.map((c, i) => ({
    index: i,
    time: new Date(c.openTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    label: new Date(c.openTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    price: Number(c.close),
  })));
}
