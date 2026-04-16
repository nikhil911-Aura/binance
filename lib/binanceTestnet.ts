import crypto from "crypto";

const TESTNET_URL =
  process.env.BINANCE_TESTNET_URL ?? "https://testnet.binancefuture.com";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";

function sign(queryString: string): string {
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(queryString)
    .digest("hex");
}

function buildSignedParams(params: Record<string, string | number>): string {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const signature = sign(qs);
  return `${qs}&signature=${signature}`;
}

async function signedRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  params.timestamp = Date.now();
  params.recvWindow = 5000;
  const body = buildSignedParams(params);
  const url =
    method === "GET"
      ? `${TESTNET_URL}${path}?${body}`
      : `${TESTNET_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": API_KEY,
      ...(method !== "GET" && {
        "Content-Type": "application/x-www-form-urlencoded",
      }),
    },
    ...(method !== "GET" && { body }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.msg ?? JSON.stringify(data);
    throw new Error(`Binance testnet ${res.status}: ${msg}`);
  }
  return data as T;
}

// --- Testnet symbol validation (cached) ---

type ExchangeInfo = {
  symbols: Array<{ symbol: string; status: string }>;
};

let testnetSymbolsCache: { at: number; symbols: Set<string> } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function loadTestnetSymbols(): Promise<Set<string>> {
  if (testnetSymbolsCache && Date.now() - testnetSymbolsCache.at < CACHE_TTL) {
    return testnetSymbolsCache.symbols;
  }
  const res = await fetch(`${TESTNET_URL}/fapi/v1/exchangeInfo`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`testnet exchangeInfo ${res.status}`);
  const data = (await res.json()) as ExchangeInfo;
  const symbols = new Set(
    data.symbols.filter((s) => s.status === "TRADING").map((s) => s.symbol),
  );
  testnetSymbolsCache = { at: Date.now(), symbols };
  return symbols;
}

export async function isTestnetSymbol(symbol: string): Promise<boolean> {
  try {
    const symbols = await loadTestnetSymbols();
    return symbols.has(symbol);
  } catch {
    return true; // If we can't verify, allow the attempt
  }
}

// --- Public types ---

export type OrderResponse = {
  orderId: number;
  symbol: string;
  side: string;
  type: string;
  status: string;
  avgPrice: string;
  executedQty: string;
  origQty: string;
};

export type PositionRisk = {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  unRealizedProfit: string;
  markPrice: string;
  liquidationPrice: string;
};

// --- API methods ---

/** Place a MARKET order on the Binance Futures testnet. */
export async function placeMarketOrder(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
): Promise<OrderResponse> {
  return signedRequest<OrderResponse>("POST", "/fapi/v1/order", {
    symbol,
    side,
    type: "MARKET",
    quantity,
  });
}

/** Close a position by placing the opposite market order. */
export async function closePosition(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
): Promise<OrderResponse> {
  const oppositeSide = side === "BUY" ? "SELL" : "BUY";
  return signedRequest<OrderResponse>("POST", "/fapi/v1/order", {
    symbol,
    side: oppositeSide,
    type: "MARKET",
    quantity,
    reduceOnly: "true",
  });
}

/** Fetch all current position risk from testnet. */
export async function getPositionRisk(): Promise<PositionRisk[]> {
  return signedRequest<PositionRisk[]>("GET", "/fapi/v2/positionRisk", {});
}
