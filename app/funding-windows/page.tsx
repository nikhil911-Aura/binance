"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const FundingWindowChart = dynamic(() => import("@/components/FundingWindowChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center text-sm text-neutral-500">
      Loading chart…
    </div>
  ),
});

type FundingEvent = {
  symbol: string;
  fundingTime: string;
  fundingRate: number;
  dataPoints: number;
  minPrice: number | null;
  maxPrice: number | null;
};

type PricePoint = { price: number; recordedAt: string; phase: string };

function formatRate(rate: number) {
  const pct = rate * 100;
  const color = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-neutral-400";
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(4)}%`, color };
}

function formatPrice(price: number) {
  if (price >= 1000)
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(4)}`;
}

export default function FundingWindowsPage() {
  const [events, setEvents] = useState<FundingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pointsMap, setPointsMap] = useState<Record<string, PricePoint[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");

  useEffect(() => {
    fetch("/api/funding-windows")
      .then((r) => r.json())
      .then((data: FundingEvent[]) => setEvents(data))
      .finally(() => setLoading(false));
  }, []);

  async function selectEvent(event: FundingEvent) {
    const key = `${event.symbol}_${event.fundingTime}`;
    if (selectedKey === key) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(key);
    if (pointsMap[key]) return;

    setLoadingKey(key);
    try {
      const res = await fetch(
        `/api/funding-windows?symbol=${event.symbol}&fundingTime=${encodeURIComponent(event.fundingTime)}`
      );
      const data: PricePoint[] = await res.json();
      setPointsMap((m) => ({ ...m, [key]: data }));
    } finally {
      setLoadingKey(null);
    }
  }

  const filtered = events.filter((e) =>
    symbolFilter ? e.symbol.includes(symbolFilter.toUpperCase()) : true
  );

  // Group events by symbol for display
  const symbols = Array.from(new Set(events.map((e) => e.symbol))).sort();

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Dashboard
        </Link>
        <span className="text-neutral-700">/</span>
        <h1 className="text-xl font-bold text-neutral-100">Funding Window Recorder</h1>
      </div>

      {/* Info banner */}
      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
        Records 1-second price snapshots for symbols with{" "}
        <span className="font-mono text-neutral-200">|fundingRate| ≥ 3%</span> — starting
        1 minute before and ending 1 minute after each funding event. The cron job detects
        qualifying symbols and streams prices automatically.
      </div>

      {/* Filter */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500"
        >
          <option value="">All symbols</option>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-600">{filtered.length} events</span>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 px-6 py-12 text-center">
          <p className="text-base font-medium text-neutral-300">No recordings yet</p>
          <p className="mt-2 text-sm text-neutral-500">
            The cron job records data automatically when a symbol with{" "}
            <span className="font-mono">|rate| ≥ 3%</span> is within 1 minute of its
            funding time. Make sure the cron process is running.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => {
            const key = `${event.symbol}_${event.fundingTime}`;
            const isSelected = selectedKey === key;
            const points = pointsMap[key] ?? [];
            const isLoading = loadingKey === key;
            const rate = formatRate(event.fundingRate);

            const beforePoints = points.filter((p) => p.phase === "before");
            const afterPoints = points.filter((p) => p.phase === "after");
            const priceAtStart = beforePoints[0]?.price ?? null;
            const priceAtEnd = afterPoints[afterPoints.length - 1]?.price ?? null;
            const pctChange =
              priceAtStart != null && priceAtEnd != null
                ? ((priceAtEnd - priceAtStart) / priceAtStart) * 100
                : null;

            return (
              <div
                key={key}
                className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
              >
                {/* Event header row */}
                <button
                  onClick={() => selectEvent(event)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-neutral-800/50"
                >
                  <span className="w-28 font-mono font-semibold text-neutral-100">
                    {event.symbol}
                  </span>
                  <span className={`w-24 font-mono text-sm font-medium ${rate.color}`}>
                    {rate.text}
                  </span>
                  <span className="flex-1 text-sm text-neutral-400">
                    {new Date(event.fundingTime).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-xs text-neutral-600">
                    {event.dataPoints} pts
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {isSelected ? "▲" : "▼"}
                  </span>
                </button>

                {/* Expanded chart + stats */}
                {isSelected && (
                  <div className="border-t border-neutral-800 px-4 py-4">
                    {/* Stats row */}
                    {points.length > 0 && (
                      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCard
                          label="Before (T−1min)"
                          value={priceAtStart != null ? formatPrice(priceAtStart) : "—"}
                        />
                        <StatCard
                          label="After (T+1min)"
                          value={priceAtEnd != null ? formatPrice(priceAtEnd) : "—"}
                        />
                        <StatCard
                          label="Window Change"
                          value={
                            pctChange != null
                              ? `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(3)}%`
                              : "—"
                          }
                          color={
                            pctChange != null
                              ? pctChange >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                              : "text-neutral-400"
                          }
                        />
                        <StatCard
                          label="Data Points"
                          value={`${beforePoints.length}B / ${afterPoints.length}A`}
                        />
                      </div>
                    )}

                    {isLoading ? (
                      <div className="flex h-[260px] items-center justify-center text-sm text-neutral-500">
                        Loading data…
                      </div>
                    ) : points.length === 0 ? (
                      <div className="flex h-[260px] items-center justify-center text-sm text-neutral-500">
                        No price points recorded for this event
                      </div>
                    ) : (
                      <FundingWindowChart data={points} fundingTime={event.fundingTime} />
                    )}

                    {/* X-axis legend */}
                    <div className="mt-2 flex items-center justify-center gap-6 text-xs text-neutral-500">
                      <span>← Before funding</span>
                      <span className="text-amber-500">│ Funding time (T=0)</span>
                      <span>After funding →</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  color = "text-neutral-100",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
