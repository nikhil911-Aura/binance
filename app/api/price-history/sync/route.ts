import { NextResponse } from "next/server";
import { syncPriceHistory } from "@/lib/priceHistory";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runSync() {
  const results = await syncPriceHistory();
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  return { ok: true, results, totalInserted };
}

// Called by Vercel cron (GET only)
export async function GET() {
  try {
    const data = await runSync();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Called manually from UI
export async function POST() {
  try {
    const data = await runSync();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
