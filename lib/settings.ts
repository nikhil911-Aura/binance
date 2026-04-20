import { prisma } from "./prisma";

export type AppSettings = {
  binanceUrl: string;
  binanceApiKey: string;
  binanceApiSecret: string;
};

const DEFAULTS: AppSettings = {
  binanceUrl: process.env.BINANCE_TESTNET_URL ?? "https://testnet.binancefuture.com",
  binanceApiKey: process.env.BINANCE_TESTNET_API_KEY ?? "",
  binanceApiSecret: process.env.BINANCE_TESTNET_API_SECRET ?? "",
};

let cache: { settings: AppSettings; at: number } | null = null;
const CACHE_TTL = 60_000; // 1 minute

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.settings;

  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const settings: AppSettings = {
    binanceUrl: map["binanceUrl"] ?? DEFAULTS.binanceUrl,
    binanceApiKey: map["binanceApiKey"] ?? DEFAULTS.binanceApiKey,
    binanceApiSecret: map["binanceApiSecret"] ?? DEFAULTS.binanceApiSecret,
  };

  cache = { settings, at: Date.now() };
  return settings;
}

export function invalidateSettingsCache() {
  cache = null;
}

export const PRESETS = {
  testnet: "https://testnet.binancefuture.com",
  mainnet: "https://fapi.binance.com",
};
