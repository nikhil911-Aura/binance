"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const PriceChart = dynamic(() => import("@/components/PriceChart"), {
  ssr: false,
  loading: () => <div className="flex h-[300px] items-center justify-center text-sm text-neutral-500">Loading chart…</div>,
});

type Candle = { openTime: string; open: number; high: number; low: number; close: number; volume: number };
type PagedResponse = { total: number; page: number; limit: number; totalPages: number; rows: Candle[] };
type Symbol = { name: string };

const RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
  { label: "30D", hours: 720 },
];

const PAGE_SIZE = 100;

export default function PriceHistoryPage() {
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [selected, setSelected] = useState("");
  const [range, setRange] = useState(24);

  // Chart — fetches a sample of points for the full range
  const [chartData, setChartData] = useState<{ index: number; time: string; label?: string; price: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Table — server-side paginated
  const [rows, setRows] = useState<Candle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

  // Stats from first page metadata
  const [stats, setStats] = useState<{ latest: number | null; first: number | null; high: number | null; low: number | null } | null>(null);

  useEffect(() => {
    fetch("/api/symbols")
      .then((r) => r.json())
      .then((data: Symbol[]) => {
        setSymbols(data);
        if (data.length > 0) setSelected(data[0].name);
      });
  }, []);

  // Fetch chart data (page 1, large limit for sampling)
  useEffect(() => {
    if (!selected) return;
    setChartLoading(true);
    setError("");
    setPage(1);
    const from = new Date(Date.now() - range * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    // For chart we fetch up to 500 points sampled across the range
    fetch(`/api/price-history?symbol=${selected}&from=${from}&to=${to}&page=1&limit=100`)
      .then((r) => r.json())
      .then((data: PagedResponse) => {
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 0);
        setRows(data.rows ?? []);
        // Build chart from a separate full-range sample
        fetchChartSample(selected, from, to);
        // Stats: fetch first candle for comparison
        fetchStats(selected, from, to);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setTableLoading(false));
  }, [selected, range]);

  async function fetchChartSample(symbol: string, from: string, to: string) {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/price-history/chart?symbol=${symbol}&from=${from}&to=${to}`);
      const data = await res.json();
      setChartData(Array.isArray(data) ? data : []);
    } catch { /* skip */ }
    finally { setChartLoading(false); }
  }

  async function fetchStats(symbol: string, from: string, to: string) {
    try {
      const [latestRes, statsRes] = await Promise.all([
        fetch(`/api/price-history?symbol=${symbol}&from=${from}&to=${to}&page=1&limit=1`),
        fetch(`/api/price-history/stats?symbol=${symbol}&from=${from}&to=${to}`),
      ]);
      const latestData: PagedResponse = await latestRes.json();
      const statsData = statsRes.ok ? await statsRes.json() : null;
      setStats({
        latest: latestData.rows?.[0]?.close ?? null,
        first: statsData?.firstClose ?? null,
        high: statsData?.high ?? null,
        low: statsData?.low ?? null,
      });
    } catch { /* skip */ }
  }

  async function fetchPage(p: number) {
    if (!selected) return;
    setTableLoading(true);
    setPage(p);
    const from = new Date(Date.now() - range * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    try {
      const res = await fetch(`/api/price-history?symbol=${selected}&from=${from}&to=${to}&page=${p}&limit=${PAGE_SIZE}`);
      const data: PagedResponse = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch { /* skip */ }
    finally { setTableLoading(false); }
  }

  const pctChange = stats?.latest != null && stats?.first != null
    ? ((stats.latest - stats.first) / stats.first) * 100
    : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">← Dashboard</Link>
        <span className="text-neutral-700">/</span>
        <h1 className="text-xl font-bold text-neutral-100">Price History</h1>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); }}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500"
        >
          {symbols.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>

        <div className="flex rounded-md border border-neutral-700 overflow-hidden text-xs font-medium">
          {RANGES.map((r) => (
            <button key={r.label} onClick={() => setRange(r.hours)}
              className={`px-3 py-2 transition-colors ${range === r.hours ? "bg-emerald-600 text-white" : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"}`}>
              {r.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-neutral-600">{total.toLocaleString()} candles</span>
      </div>

      {/* Stats */}
      {stats?.latest != null && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Latest Price" value={`$${stats.latest.toLocaleString(undefined, { maximumFractionDigits: 4 })}`} />
          <StatCard
            label={`Change (${RANGES.find((r) => r.hours === range)?.label})`}
            value={pctChange != null ? `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%` : "—"}
            color={pctChange != null ? (pctChange >= 0 ? "text-emerald-400" : "text-red-400") : "text-neutral-400"}
          />
          <StatCard label="High" value={stats.high != null ? `$${stats.high.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—"} color="text-emerald-400" />
          <StatCard label="Low" value={stats.low != null ? `$${stats.low.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—"} color="text-red-400" />
        </div>
      )}

      {/* Chart */}
      <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        {chartLoading ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-neutral-500">Loading chart…</div>
        ) : error ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-neutral-500">{error}</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-sm text-neutral-500">
            <p>No data for this range.</p>
            <p className="text-xs">Click <span className="text-emerald-400">Sync Price History</span> on the dashboard first.</p>
          </div>
        ) : (
          <PriceChart data={chartData} />
        )}
      </div>

      {/* Table */}
      {total > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-200">
              Candles
              <span className="ml-2 text-xs font-normal text-neutral-500">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
              </span>
            </h2>
            <Pagination page={page} totalPages={totalPages} onPage={fetchPage} disabled={tableLoading} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-950 text-left text-neutral-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2 text-right">Open</th>
                  <th className="px-4 py-2 text-right">High</th>
                  <th className="px-4 py-2 text-right">Low</th>
                  <th className="px-4 py-2 text-right">Close</th>
                  <th className="px-4 py-2 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-neutral-800 ${tableLoading ? "opacity-40" : ""}`}>
                {rows.map((c, i) => {
                  const isGreen = c.close >= c.open;
                  return (
                    <tr key={i} className="hover:bg-neutral-800/40">
                      <td className="px-4 py-1.5 font-mono text-neutral-400">
                        {new Date(c.openTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-neutral-300">${c.open.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-emerald-400">${c.high.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-red-400">${c.low.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className={`px-4 py-1.5 text-right font-mono font-medium ${isGreen ? "text-emerald-400" : "text-red-400"}`}>
                        ${c.close.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-neutral-500">{c.volume.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="border-t border-neutral-800 px-4 py-3 flex justify-end">
              <Pagination page={page} totalPages={totalPages} onPage={fetchPage} disabled={tableLoading} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function Pagination({ page, totalPages, onPage, disabled }: { page: number; totalPages: number; onPage: (p: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onPage(1)} disabled={disabled || page === 1} className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30">«</button>
      <button onClick={() => onPage(page - 1)} disabled={disabled || page === 1} className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30">← Prev</button>
      <span className="text-xs text-neutral-500">Page {page} / {totalPages}</span>
      <button onClick={() => onPage(page + 1)} disabled={disabled || page === totalPages} className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30">Next →</button>
      <button onClick={() => onPage(totalPages)} disabled={disabled || page === totalPages} className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30">»</button>
    </div>
  );
}

function StatCard({ label, value, color = "text-neutral-100" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
