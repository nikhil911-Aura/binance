const BINANCE_API_URL =
  process.env.BINANCE_API_URL ?? "https://fapi.binance.com";

const TTL_MS = 5 * 60 * 1000;

type ExchangeInfo = {
  symbols: Array<{ symbol: string; status: string; contractType: string }>;
};
type FundingInfoEntry = { symbol: string; fundingIntervalHours: number };

type SymbolsCache = { at: number; symbols: string[] };
type IntervalsCache = { at: number; map: Map<string, number> };

let symbolsCache: SymbolsCache | null = null;
let intervalsCache: IntervalsCache | null = null;
let symbolsInflight: Promise<string[]> | null = null;
let intervalsInflight: Promise<Map<string, number>> | null = null;

export async function loadTradableSymbols(): Promise<string[]> {
  if (symbolsCache && Date.now() - symbolsCache.at < TTL_MS) {
    return symbolsCache.symbols;
  }
  if (symbolsInflight) return symbolsInflight;

  symbolsInflight = (async () => {
    try {
      const res = await fetch(`${BINANCE_API_URL}/fapi/v1/exchangeInfo`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
      const data = (await res.json()) as ExchangeInfo;
      const symbols = data.symbols
        .filter((s) => s.status === "TRADING")
        .map((s) => s.symbol)
        .sort();
      symbolsCache = { at: Date.now(), symbols };
      return symbols;
    } catch (err) {
      if (symbolsCache) return symbolsCache.symbols;
      throw err;
    } finally {
      symbolsInflight = null;
    }
  })();
  return symbolsInflight;
}

export async function loadFundingIntervals(): Promise<Map<string, number>> {
  if (intervalsCache && Date.now() - intervalsCache.at < TTL_MS) {
    return intervalsCache.map;
  }
  if (intervalsInflight) return intervalsInflight;

  intervalsInflight = (async () => {
    try {
      const res = await fetch(`${BINANCE_API_URL}/fapi/v1/fundingInfo`, {
        cache: "no-store",
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
      intervalsCache = { at: Date.now(), map };
      return map;
    } catch (err) {
      if (intervalsCache) return intervalsCache.map;
      console.error("[binanceMeta] fundingInfo failed:", err);
      return new Map();
    } finally {
      intervalsInflight = null;
    }
  })();
  return intervalsInflight;
}

export function invalidateBinanceMetaCache() {
  symbolsCache = null;
  intervalsCache = null;
}
