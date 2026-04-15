import { NextResponse } from "next/server";
import { loadTradableSymbols } from "@/lib/binanceMeta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "")
    .trim()
    .toUpperCase();

  try {
    const all = await loadTradableSymbols();
    if (!q) return NextResponse.json(all.slice(0, 10));

    const starts = all.filter((s) => s.startsWith(q));
    const contains = all.filter((s) => !s.startsWith(q) && s.includes(q));
    const merged = [...starts, ...contains];

    // User typed an exact symbol we don't have cached yet — surface it anyway
    // so they never see "no results" for a symbol that actually exists.
    if (merged.length === 0 && /^[A-Z0-9]{5,20}$/.test(q)) {
      return NextResponse.json([q]);
    }
    return NextResponse.json(merged.slice(0, 10));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[search] failed:", msg);
    if (msg.includes("451")) {
      return NextResponse.json(
        { error: "Binance API is geo-blocked from this region" },
        { status: 451 },
      );
    }
    if (/^[A-Z0-9]{5,20}$/.test(q)) return NextResponse.json([q]);
    return NextResponse.json([], { status: 200 });
  }
}
