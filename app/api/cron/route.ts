import { NextResponse } from "next/server";
import { recordIfInWindow } from "@/lib/fundingWindowRecorder";
import { autoSyncSymbols } from "@/lib/autoSync";
import { backfillFundingWindows } from "@/lib/fundingWindowBackfill";

export const dynamic = "force-dynamic";

export async function GET() {
  await Promise.all([recordIfInWindow(), autoSyncSymbols(), backfillFundingWindows()]);
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
