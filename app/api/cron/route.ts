import { NextResponse } from "next/server";
import { updateAllSymbols } from "@/lib/updateFunding";

export const dynamic = "force-dynamic";

// Serverless cron endpoint (Vercel Cron / external scheduler).
// Protect with CRON_SECRET header: `Authorization: Bearer <secret>`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await updateAllSymbols();
  return NextResponse.json(result);
}
