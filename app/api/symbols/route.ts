import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fetchPremiumIndex, fetchAllMarkPrices } from "@/lib/binance";
import { refreshStaleSymbols } from "@/lib/updateFunding";
import { invalidateBinanceMetaCache } from "@/lib/binanceMeta";
import { recordIfInWindow } from "@/lib/fundingWindowRecorder";
import { autoSyncSymbols } from "@/lib/autoSync";

export const dynamic = "force-dynamic";

const SymbolSchema = z.object({
  name: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{5,20}$/, "Symbol must be uppercase letters/digits (e.g. BTCUSDT)"),
});

export async function GET(req: Request) {
  await Promise.all([refreshStaleSymbols(), recordIfInWindow(), autoSyncSymbols()]);
  const sort = new URL(req.url).searchParams.get("sort");
  let symbols = await prisma.symbol.findMany({ orderBy: { createdAt: "desc" } });

  // Sort by absolute funding rate descending (highest magnitude first)
  if (sort === "fundingRate") {
    symbols = symbols.sort(
      (a, b) =>
        Math.abs(b.fundingRate ?? 0) - Math.abs(a.fundingRate ?? 0),
    );
  }

  // Attach live mark prices — also freshen updatedAt when live price is available
  const prices = await fetchAllMarkPrices();
  const now = new Date();
  const withPrices = symbols.map((s) => ({
    ...s,
    markPrice: prices.get(s.name) ?? null,
    updatedAt: prices.has(s.name) ? now : s.updatedAt,
  }));

  return NextResponse.json(withPrices);
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
      isFavorite: true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
