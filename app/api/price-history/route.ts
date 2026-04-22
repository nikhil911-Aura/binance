import { NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/priceHistory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)));

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();

  const data = await getPriceHistory(symbol, fromDate, toDate, page, limit);
  return NextResponse.json(data);
}
