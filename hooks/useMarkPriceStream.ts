"use client";

import { useEffect, useRef, useState } from "react";

// Polls /api/mark-prices every 5 seconds via the app's own server (which proxies
// to Binance REST). This works on all networks, including those that block direct
// WebSocket connections to Binance streaming endpoints.
const POLL_MS = 5_000;

type PriceMap = Map<string, number>;

export function useMarkPriceStream(symbols: string[]): PriceMap {
  const [prices, setPrices] = useState<PriceMap>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolsKey = symbols.slice().sort().join(",");

  useEffect(() => {
    if (!symbolsKey) return;

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/mark-prices?symbols=${symbolsKey}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data: Record<string, number> = await res.json();
          setPrices((prev) => {
            const next = new Map(prev);
            for (const [sym, price] of Object.entries(data)) {
              next.set(sym, price);
            }
            return next;
          });
        }
      } catch { /* ignore network errors */ }
      if (!cancelled) {
        timerRef.current = setTimeout(poll, POLL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return prices;
}
