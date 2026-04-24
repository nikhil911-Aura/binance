"use client";

import { useEffect, useRef, useState } from "react";

const WS_ENDPOINT = "wss://fstream.binance.com/ws";
const RECONNECT_MS = 3000;

type PriceMap = Map<string, number>;

export function useMarkPriceStream(symbols: string[]): PriceMap {
  const [prices, setPrices] = useState<PriceMap>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const symbolsKey = symbols.slice().sort().join(",");

  useEffect(() => {
    if (!symbolsKey) return;

    const streams = symbolsKey
      .split(",")
      .map((s) => `${s.toLowerCase()}@markPrice@1s`);

    function connect() {
      const ws = new WebSocket(WS_ENDPOINT);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ method: "SUBSCRIBE", params: streams, id: 1 }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.result !== undefined) return; // subscription ack
          const sym: string = msg.s;
          const price = parseFloat(msg.p);
          if (sym && !isNaN(price)) {
            setPrices((p) => new Map(p).set(sym, price));
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          timerRef.current = setTimeout(connect, RECONNECT_MS);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      const sock = wsRef.current;
      wsRef.current = null;
      if (sock) {
        sock.onclose = null;
        sock.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return prices;
}
