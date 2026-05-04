import { NextResponse } from "next/server";
import { recordIfInWindow } from "@/lib/fundingWindowRecorder";
import { autoSyncSymbols } from "@/lib/autoSync";

export const dynamic = "force-dynamic";

export async function GET() {
  await Promise.all([recordIfInWindow(), autoSyncSymbols()]);
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
