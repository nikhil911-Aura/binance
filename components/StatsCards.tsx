"use client";

import { useEffect, useState } from "react";

type Row = {
  fundingRate: number | null;
  nextFundingTime: string | null;
};

function useNow() {
  // Start with null to avoid hydration mismatch (server time != client time)
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StatsCards({ rows }: { rows: Row[] }) {
  const now = useNow();

  const withRate = rows.filter((r) => r.fundingRate !== null);
  const avg =
    withRate.length > 0
      ? withRate.reduce((a, r) => a + (r.fundingRate ?? 0), 0) / withRate.length
      : null;

  const positives = withRate.filter((r) => (r.fundingRate ?? 0) > 0).length;
  const negatives = withRate.filter((r) => (r.fundingRate ?? 0) < 0).length;

  const upcoming = rows
    .map((r) => (r.nextFundingTime ? new Date(r.nextFundingTime).getTime() : 0))
    .filter((t) => now !== null && t > now);
  const nextEvent = upcoming.length > 0 ? Math.min(...upcoming) : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="Symbols Tracked" value={String(rows.length)} />
      <Card
        label="Avg Funding Rate"
        value={avg === null ? "—" : `${(avg * 100).toFixed(4)}%`}
        valueColor={
          avg === null
            ? "text-neutral-300"
            : avg > 0
              ? "text-emerald-400"
              : avg < 0
                ? "text-red-400"
                : "text-neutral-300"
        }
      />
      <Card
        label="Positive / Negative"
        value={
          <span>
            <span className="text-emerald-400">{positives}</span>
            <span className="text-neutral-500"> / </span>
            <span className="text-red-400">{negatives}</span>
          </span>
        }
      />
      <Card
        label="Next Funding"
        value={
          now === null ? "—" : nextEvent === null ? "—" : fmtCountdown(nextEvent - now)
        }
        mono
      />
    </div>
  );
}

function Card({
  label,
  value,
  valueColor = "text-neutral-100",
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${valueColor} ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
