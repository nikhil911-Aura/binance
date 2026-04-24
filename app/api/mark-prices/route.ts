import { NextResponse } from "next/server";
import { fetchAllMarkPrices } from "@/lib/binance";

export const dynamic = "force-dynamic";

// Lightweight endpoint: returns { BTCUSDT: 78000, ... } for requested symbols.
// Called every 5 seconds by the client as a WebSocket fallback.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) return NextResponse.json({});

  const all = await fetchAllMarkPrices();
  const result: Record<string, number> = {};
  for (const sym of symbols) {
    const p = all.get(sym);
    if (p != null) result[sym] = p;
  }
  return NextResponse.json(result);
}
