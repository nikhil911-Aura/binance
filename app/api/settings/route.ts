import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, invalidateSettingsCache } from "@/lib/settings";

export const dynamic = "force-dynamic";

function maskValue(val: string): string | null {
  if (val.length === 0) return null;
  if (val.length <= 8) return `${val.slice(0, 2)}${"•".repeat(val.length - 2)}`;
  return `${val.slice(0, 4)}${"•".repeat(8)}${val.slice(-4)}`;
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    binanceUrl: settings.binanceUrl,
    binanceApiKeySet: settings.binanceApiKey.length > 0,
    binanceApiSecretSet: settings.binanceApiSecret.length > 0,
    binanceApiKeyMasked: maskValue(settings.binanceApiKey),
    binanceApiSecretMasked: maskValue(settings.binanceApiSecret),
  });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    binanceUrl?: string;
    binanceApiKey?: string;
    binanceApiSecret?: string;
  };

  const updates: { key: string; value: string }[] = [];
  if (body.binanceUrl) updates.push({ key: "binanceUrl", value: body.binanceUrl.trim() });
  if (body.binanceApiKey !== undefined) updates.push({ key: "binanceApiKey", value: body.binanceApiKey.trim() });
  if (body.binanceApiSecret !== undefined && body.binanceApiSecret.length > 0) {
    updates.push({ key: "binanceApiSecret", value: body.binanceApiSecret.trim() });
  }

  await Promise.all(
    updates.map((u) =>
      prisma.setting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      }),
    ),
  );

  invalidateSettingsCache();
  return NextResponse.json({ ok: true });
}
