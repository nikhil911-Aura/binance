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

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Fetch 1-minute mark price klines for a symbol between startTime and endTime. */
export async function fetchMarkPriceKlines(
  symbol: string,
  startTime: number,
  endTime: number,
  limit = 1500,
): Promise<Kline[]> {
  const url = `${BINANCE_API_URL}/fapi/v1/markPriceKlines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`markPriceKlines ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((r) => ({
    openTime: r[0] as number,
    open: parseFloat(r[1] as string),
    high: parseFloat(r[2] as string),
    low: parseFloat(r[3] as string),
    close: parseFloat(r[4] as string),
    volume: parseFloat(r[5] as string),
  }));
}

export type AllPremiumData = {
  markPrice: number;
  fundingRate: number;
  nextFundingTime: Date;
};

/** Fetch mark price + funding rate for all futures symbols in one call. */
export async function fetchAllPremiumData(): Promise<Map<string, AllPremiumData>> {
  const url = `${BINANCE_API_URL}/fapi/v1/premiumIndex`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as Array<{
      symbol: string;
      markPrice: string;
      lastFundingRate: string;
      nextFundingTime: number;
    }>;
    const map = new Map<string, AllPremiumData>();
    for (const item of data) {
      const markPrice = parseFloat(item.markPrice);
      if (markPrice > 0) {
        map.set(item.symbol, {
          markPrice,
          fundingRate: parseFloat(item.lastFundingRate) || 0,
          nextFundingTime: new Date(item.nextFundingTime),
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Fetch mark prices for all futures symbols in one call. Returns a map of symbol → price. */
export async function fetchAllMarkPrices(): Promise<Map<string, number>> {
  const all = await fetchAllPremiumData();
  const map = new Map<string, number>();
  for (const [symbol, data] of all) map.set(symbol, data.markPrice);
  return map;
}
