import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fetchPremiumIndex } from "@/lib/binance";
import { refreshStaleSymbols } from "@/lib/updateFunding";
import { invalidateBinanceMetaCache } from "@/lib/binanceMeta";

export const dynamic = "force-dynamic";

const SymbolSchema = z.object({
  name: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{5,20}$/, "Symbol must be uppercase letters/digits (e.g. BTCUSDT)"),
});

export async function GET() {
  // On-demand: refresh any rows older than 30s before returning.
  await refreshStaleSymbols();
  const symbols = await prisma.symbol.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(symbols);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SymbolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const name = parsed.data.name;

  const existing = await prisma.symbol.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "Symbol already exists" }, { status: 409 });
  }

  const data = await fetchPremiumIndex(name);
  if (!data) {
    return NextResponse.json(
      { error: "Symbol not found on Binance Futures" },
      { status: 400 },
    );
  }
  invalidateBinanceMetaCache();

  const created = await prisma.symbol.create({
    data: {
      name,
      fundingRate: data.fundingRate,
      nextFundingTime: data.nextFundingTime,
      fundingInterval: data.fundingInterval,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
