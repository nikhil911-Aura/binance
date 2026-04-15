const BINANCE_API_URL =
  process.env.BINANCE_API_URL ?? "https://fapi.binance.com";

export type PremiumIndex = {
  symbol: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
};

export type FundingData = {
  fundingRate: number;
  nextFundingTime: Date;
  fundingInterval: number;
};

type FundingInfoEntry = { symbol: string; fundingIntervalHours: number };

let intervalCache: { at: number; map: Map<string, number> } | null = null;
const INTERVAL_TTL_MS = 60 * 60 * 1000;

async function loadFundingIntervals(): Promise<Map<string, number>> {
  if (intervalCache && Date.now() - intervalCache.at < INTERVAL_TTL_MS) {
    return intervalCache.map;
  }
  try {
    const res = await fetch(`${BINANCE_API_URL}/fapi/v1/fundingInfo`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`fundingInfo ${res.status}`);
    const rows = (await res.json()) as FundingInfoEntry[];
    const map = new Map<string, number>();
    for (const r of rows) {
      if (typeof r.fundingIntervalHours === "number") {
        map.set(r.symbol, r.fundingIntervalHours);
      }
    }
    intervalCache = { at: Date.now(), map };
    return map;
  } catch (err) {
    console.error("[binance] fundingInfo failed:", err);
    return intervalCache?.map ?? new Map();
  }
}

export async function fetchPremiumIndex(
  symbol: string,
  retries = 2,
): Promise<FundingData | null> {
  const url = `${BINANCE_API_URL}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        if (res.status === 400) return null;
        throw new Error(`Binance ${res.status}`);
      }
      const data = (await res.json()) as PremiumIndex;
      const intervals = await loadFundingIntervals();
      return {
        fundingRate: parseFloat(data.lastFundingRate),
        nextFundingTime: new Date(data.nextFundingTime),
        fundingInterval: intervals.get(data.symbol) ?? 8,
      };
    } catch (err) {
      if (attempt === retries) {
        console.error(`[binance] ${symbol} failed:`, err);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

export async function isValidSymbol(symbol: string): Promise<boolean> {
  return (await fetchPremiumIndex(symbol, 0)) !== null;
}
