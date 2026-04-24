"use client";

import { useEffect, useRef, useState } from "react";

const WS_ENDPOINT = "wss://fstream.binance.com/ws";
const RECONNECT_INITIAL_MS = 5000;
const RECONNECT_MAX_MS = 60000;

type PriceMap = Map<string, number>;
export type StreamStatus = "connecting" | "live" | "polling";

export function useMarkPriceStream(symbols: string[]): { prices: PriceMap; status: StreamStatus } {
  const [prices, setPrices] = useState<PriceMap>(new Map());
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_INITIAL_MS);

  const symbolsKey = symbols.slice().sort().join(",");

  useEffect(() => {
    if (!symbolsKey) return;

    reconnectDelayRef.current = RECONNECT_INITIAL_MS;

    const streams = symbolsKey
      .split(",")
      .map((s) => `${s.toLowerCase()}@markPrice@1s`);

    function scheduleReconnect() {
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
      timerRef.current = setTimeout(connect, delay);
    }

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(WS_ENDPOINT);
      wsRef.current = ws;

      // If no price data arrives within 5s of connecting, treat as failed
      let dataTimeout: ReturnType<typeof setTimeout> | null = null;

      ws.onopen = () => {
        ws.send(JSON.stringify({ method: "SUBSCRIBE", params: streams, id: 1 }));
        dataTimeout = setTimeout(() => {
          if (wsRef.current === ws) {
            setStatus("polling");
            ws.onclose = null;
            ws.close();
            wsRef.current = null;
            scheduleReconnect();
          }
        }, 5000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.result !== undefined) return;
          const sym: string = msg.s;
          const price = parseFloat(msg.p);
          if (sym && !isNaN(price)) {
            if (dataTimeout) { clearTimeout(dataTimeout); dataTimeout = null; }
            reconnectDelayRef.current = RECONNECT_INITIAL_MS;
            setStatus("live");
            setPrices((p) => new Map(p).set(sym, price));
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (dataTimeout) { clearTimeout(dataTimeout); dataTimeout = null; }
        if (wsRef.current === ws) {
          wsRef.current = null;
          setStatus("polling");
          scheduleReconnect();
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

  return { prices, status };
}
