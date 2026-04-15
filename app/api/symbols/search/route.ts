import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BINANCE_API_URL =
  process.env.BINANCE_API_URL ?? "https://fapi.binance.com";

type ExchangeInfo = {
  symbols: Array<{ symbol: string; status: string; contractType: string }>;
};

let cache: { at: number; symbols: string[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

async function loadSymbols(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.symbols;
  const res = await fetch(`${BINANCE_API_URL}/fapi/v1/exchangeInfo`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = (await res.json()) as ExchangeInfo;
  const symbols = data.symbols
    .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL")
    .map((s) => s.symbol)
    .sort();
  cache = { at: Date.now(), symbols };
  return symbols;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "")
    .trim()
    .toUpperCase();

  try {
    const all = await loadSymbols();
    if (!q) return NextResponse.json(all.slice(0, 10));
    const starts = all.filter((s) => s.startsWith(q));
    const contains = all.filter((s) => !s.startsWith(q) && s.includes(q));
    return NextResponse.json([...starts, ...contains].slice(0, 10));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[search] failed:", msg);
    if (msg.includes("451")) {
      return NextResponse.json(
        { error: "Binance API is geo-blocked from this region" },
        { status: 451 },
      );
    }
    return NextResponse.json([], { status: 200 });
  }
}
