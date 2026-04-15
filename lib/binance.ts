import { loadFundingIntervals } from "./binanceMeta";

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
