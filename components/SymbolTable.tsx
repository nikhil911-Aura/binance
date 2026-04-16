"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import QuickAddChips from "./QuickAddChips";
import ConfirmDialog from "./ConfirmDialog";
import QuantityModal, { type OrderResult } from "./QuantityModal";
import {
  EVT_ERROR,
  EVT_PENDING,
  EVT_SUCCESS,
  type SymbolRow as PendingRow,
} from "@/lib/symbolEvents";

type SymbolRow = {
  id: string;
  name: string;
  fundingRate: number | null;
  nextFundingTime: string | null;
  fundingInterval: number | null;
  markPrice: number | null;
  updatedAt?: string;
};

type SortKey = "name" | "fundingRate" | "countdown" | "absFundingRate";
type SortDir = "asc" | "desc";

function formatRate(rate: number | null): { text: string; color: string } {
  if (rate === null || rate === undefined)
    return { text: "—", color: "text-neutral-400" };
  const pct = rate * 100;
  const color =
    pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-neutral-300";
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(4)}%`, color };
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(4)}`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(target: string | null, now: number): string {
  if (!target) return "—";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "00:00:00";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function timeAgo(iso: string | undefined, now: number): string {
  if (!iso) return "—";
  const sec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export default function SymbolTable({
  initial,
  onPlaceOrders,
}: {
  initial: SymbolRow[];
  onPlaceOrders?: (symbols: string[], side: "BUY" | "SELL", qty: number) => Promise<OrderResult[] | null>;
}) {
  const [rows, setRows] = useState<SymbolRow[]>(initial);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<SymbolRow | null>(null);
  const [orderModal, setOrderModal] = useState<{ side: "BUY" | "SELL" } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [filter, setFilter] = useState("");
  const [rateFilter, setRateFilter] = useState<"all" | "positive" | "negative">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(1000);

  // Optimistic-add events
  useEffect(() => {
    const onPending = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail.name;
      setPendingNames((p) => (p.includes(name) ? p : [...p, name]));
    };
    const onSuccess = (e: Event) => {
      const row = (e as CustomEvent<{ row: PendingRow }>).detail.row;
      setPendingNames((p) => p.filter((n) => n !== row.name));
      setRows((r) => {
        if (r.some((x) => x.id === row.id)) return r;
        return [row as SymbolRow, ...r];
      });
    };
    const onError = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail.name;
      setPendingNames((p) => p.filter((n) => n !== name));
    };
    window.addEventListener(EVT_PENDING, onPending);
    window.addEventListener(EVT_SUCCESS, onSuccess);
    window.addEventListener(EVT_ERROR, onError);
    return () => {
      window.removeEventListener(EVT_PENDING, onPending);
      window.removeEventListener(EVT_SUCCESS, onSuccess);
      window.removeEventListener(EVT_ERROR, onError);
    };
  }, []);

  async function fetchRows(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/symbols", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setRows(await res.json());
      if (showSpinner) toast("success", "Refreshed");
    } catch {
      if (showSpinner) toast("error", "Failed to refresh");
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }

  // Auto-poll every 30s
  useEffect(() => {
    const id = setInterval(() => fetchRows(false), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresh when countdown hits zero
  const triggeredForRef = useRef<number>(0);
  useEffect(() => {
    const expired = rows
      .map((r) => (r.nextFundingTime ? new Date(r.nextFundingTime).getTime() : 0))
      .filter((t) => t > 0 && t <= now);
    if (expired.length === 0) return;
    const earliest = Math.min(...expired);
    if (triggeredForRef.current === earliest) return;
    triggeredForRef.current = earliest;
    const delays = [1500, 2500, 3500, 5000];
    let cancelled = false;
    (async () => {
      for (const d of delays) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, d));
        await fetchRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [now, rows]);

  async function performDelete(row: SymbolRow) {
    setConfirmRow(null);
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/symbols/${row.id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((r) => r.filter((x) => x.id !== row.id));
        setSelected((s) => { const n = new Set(s); n.delete(row.name); return n; });
        toast("success", `Removed ${row.name}`);
        startTransition(() => router.refresh());
      } else {
        toast("error", "Failed to delete");
      }
    } catch {
      toast("error", "Network error during delete");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "absFundingRate" ? "desc" : "asc"); }
  }

  // Selection helpers
  function toggleSelect(name: string) {
    setSelected((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }
  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.name)));
  }

  async function handlePlaceOrder(qty: number): Promise<OrderResult[] | null> {
    if (!onPlaceOrders || selected.size === 0 || !orderModal) return null;
    setPlacing(true);
    try {
      const results = await onPlaceOrders(Array.from(selected), orderModal.side, qty);
      const allSucceeded = results?.every((r) => r.success) ?? false;
      if (allSucceeded) {
        setSelected(new Set());
        setOrderModal(null);
      }
      // If some failed, keep modal open so user can see errors + retry
      return results;
    } finally {
      setPlacing(false);
    }
  }

  const visiblePending = pendingNames.filter((n) => !rows.some((r) => r.name === n));

  const visible = useMemo(() => {
    const f = filter.trim().toUpperCase();
    let out = f ? rows.filter((r) => r.name.includes(f)) : rows.slice();
    if (rateFilter === "positive") out = out.filter((r) => (r.fundingRate ?? 0) > 0);
    else if (rateFilter === "negative") out = out.filter((r) => (r.fundingRate ?? 0) < 0);
    out.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "name") { av = a.name; bv = b.name; }
      else if (sortKey === "fundingRate") { av = a.fundingRate ?? -Infinity; bv = b.fundingRate ?? -Infinity; }
      else if (sortKey === "absFundingRate") { av = Math.abs(a.fundingRate ?? 0); bv = Math.abs(b.fundingRate ?? 0); }
      else { av = a.nextFundingTime ? new Date(a.nextFundingTime).getTime() : Infinity; bv = b.nextFundingTime ? new Date(b.nextFundingTime).getTime() : Infinity; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, filter, rateFilter, sortKey, sortDir]);

  if (rows.length === 0 && visiblePending.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-2xl">
          📈
        </div>
        <p className="text-base font-medium text-neutral-200">No symbols yet</p>
        <p className="mt-1 text-sm text-neutral-500">Add one above or pick a popular one to get started.</p>
        <QuickAddChips />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <ConfirmDialog
        open={confirmRow !== null}
        title="Remove symbol?"
        message={<>Remove <span className="font-mono font-semibold text-neutral-200">{confirmRow?.name}</span> from your watchlist? This cannot be undone.</>}
        confirmLabel="Remove"
        kind="danger"
        onConfirm={() => confirmRow && performDelete(confirmRow)}
        onCancel={() => setConfirmRow(null)}
      />
      <QuantityModal
        open={orderModal !== null}
        side={orderModal?.side ?? "BUY"}
        symbolCount={selected.size}
        symbols={Array.from(selected)}
        onConfirm={handlePlaceOrder}
        onCancel={() => setOrderModal(null)}
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-400">
            {selected.size > 0 ? (
              <span className="text-emerald-400">{selected.size} selected</span>
            ) : (
              `${visible.length} of ${rows.length}`
            )}
            {refreshing && <span className="ml-2 text-emerald-400">• refreshing…</span>}
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-28 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
          />
          <div className="flex rounded border border-neutral-700 text-xs">
            <button
              onClick={() => setRateFilter("all")}
              className={`px-2 py-1 ${rateFilter === "all" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              All
            </button>
            <button
              onClick={() => setRateFilter("positive")}
              className={`border-l border-neutral-700 px-2 py-1 ${rateFilter === "positive" ? "bg-emerald-900/50 text-emerald-400" : "text-neutral-400 hover:text-emerald-300"}`}
            >
              +ve
            </button>
            <button
              onClick={() => setRateFilter("negative")}
              className={`border-l border-neutral-700 px-2 py-1 ${rateFilter === "negative" ? "bg-red-900/50 text-red-400" : "text-neutral-400 hover:text-red-300"}`}
            >
              -ve
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {selected.size > 0 && (
            <>
              <button
                onClick={() => setOrderModal({ side: "BUY" })}
                disabled={placing}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Buy Selected
              </button>
              <button
                onClick={() => setOrderModal({ side: "SELL" })}
                disabled={placing}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Sell Selected
              </button>
            </>
          )}
          <button
            onClick={() => toggleSort("absFundingRate")}
            className={`rounded border px-3 py-1 text-xs hover:bg-neutral-800 ${sortKey === "absFundingRate" ? "border-emerald-600 text-emerald-400" : "border-neutral-700"}`}
          >
            |Rate| {sortKey === "absFundingRate" ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
          </button>
          <button
            onClick={() => fetchRows(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            {refreshing && <Spinner className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  className="accent-emerald-500"
                />
              </th>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Symbol</Th>
              <th className="px-4 py-3">Price</th>
              <Th onClick={() => toggleSort("fundingRate")} active={sortKey === "fundingRate"} dir={sortDir}>Rate</Th>
              <Th onClick={() => toggleSort("countdown")} active={sortKey === "countdown"} dir={sortDir}>Countdown</Th>
              <th className="px-4 py-3">Interval</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {visiblePending.map((name) => (
              <tr key={`pending-${name}`} className="animate-pulse bg-emerald-950/10">
                <td className="px-3 py-3"><input type="checkbox" disabled className="accent-emerald-500 opacity-30" /></td>
                <td className="px-4 py-3 font-mono font-semibold text-emerald-300">{name}</td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-12" /></td>
                <td className="px-4 py-3 text-right text-xs text-emerald-400">Adding…</td>
              </tr>
            ))}
            {visible.length === 0 && visiblePending.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No symbols match &quot;{filter}&quot;
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const rate = formatRate(row.fundingRate);
              const isDeleting = deletingId === row.id;
              const noData = row.fundingRate === null;
              const checked = selected.has(row.name);
              return (
                <tr
                  key={row.id}
                  className={`hover:bg-neutral-900/50 ${isDeleting ? "opacity-40" : ""} ${checked ? "bg-emerald-950/10" : ""}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(row.name)}
                      className="accent-emerald-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-neutral-300">
                    {row.markPrice != null ? formatPrice(row.markPrice) : <Skeleton className="h-4 w-20" />}
                  </td>
                  <td className={`px-4 py-3 font-mono ${rate.color}`}>
                    {noData ? <Skeleton className="h-4 w-16" /> : rate.text}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {row.nextFundingTime ? formatCountdown(row.nextFundingTime, now) : <Skeleton className="h-4 w-20" />}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {row.fundingInterval ? `${row.fundingInterval}h` : <Skeleton className="h-4 w-8" />}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{timeAgo(row.updatedAt, now)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmRow(row)}
                      disabled={isDeleting}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir }) {
  return (
    <th className="px-4 py-3">
      <button onClick={onClick} className={`flex items-center gap-1 uppercase tracking-wide hover:text-neutral-200 ${active ? "text-emerald-400" : ""}`}>
        {children}
        <span className="text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded bg-neutral-700/60 ${className}`} />;
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
