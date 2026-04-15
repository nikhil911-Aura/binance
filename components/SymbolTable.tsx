"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import QuickAddChips from "./QuickAddChips";
import ConfirmDialog from "./ConfirmDialog";
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
  updatedAt?: string;
};

type SortKey = "name" | "fundingRate" | "countdown";
type SortDir = "asc" | "desc";

function formatRate(rate: number | null): { text: string; color: string } {
  if (rate === null || rate === undefined)
    return { text: "—", color: "text-neutral-400" };
  const pct = rate * 100;
  const color =
    pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-neutral-300";
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(4)}%`, color };
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
  const h = Math.floor(min / 60);
  return `${h}h ago`;
}

export default function SymbolTable({ initial }: { initial: SymbolRow[] }) {
  const [rows, setRows] = useState<SymbolRow[]>(initial);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<SymbolRow | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(1000);

  // Listen for optimistic-add events from SymbolForm / QuickAddChips
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

  useEffect(() => {
    const id = setInterval(() => fetchRows(false), 30_000);
    return () => clearInterval(id);
  }, []);

  async function performDelete(row: SymbolRow) {
    setConfirmRow(null);
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/symbols/${row.id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((r) => r.filter((x) => x.id !== row.id));
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
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = useMemo(() => {
    const f = filter.trim().toUpperCase();
    let out = f ? rows.filter((r) => r.name.includes(f)) : rows.slice();
    out.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "name") {
        av = a.name;
        bv = b.name;
      } else if (sortKey === "fundingRate") {
        av = a.fundingRate ?? -Infinity;
        bv = b.fundingRate ?? -Infinity;
      } else {
        av = a.nextFundingTime ? new Date(a.nextFundingTime).getTime() : Infinity;
        bv = b.nextFundingTime ? new Date(b.nextFundingTime).getTime() : Infinity;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, filter, sortKey, sortDir]);

  // Filter out pending names that already exist as real rows (avoid dupe)
  const visiblePending = pendingNames.filter(
    (n) => !rows.some((r) => r.name === n),
  );

  if (rows.length === 0 && visiblePending.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-2xl">
          📈
        </div>
        <p className="text-base font-medium text-neutral-200">No symbols yet</p>
        <p className="mt-1 text-sm text-neutral-500">
          Add one above or pick a popular one to get started.
        </p>
        <QuickAddChips />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <div className="flex flex-col gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-400">
            {visible.length} of {rows.length}
            {refreshing && (
              <span className="ml-2 text-emerald-400">• refreshing…</span>
            )}
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-32 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={() => fetchRows(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 self-start rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50 sm:self-auto"
        >
          {refreshing && <Spinner className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      <ConfirmDialog
        open={confirmRow !== null}
        title="Remove symbol?"
        message={
          <>
            You are about to remove{" "}
            <span className="font-mono font-semibold text-neutral-200">
              {confirmRow?.name}
            </span>{" "}
            from your watchlist. This cannot be undone.
          </>
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        kind="danger"
        onConfirm={() => confirmRow && performDelete(confirmRow)}
        onCancel={() => setConfirmRow(null)}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs uppercase text-neutral-400">
            <tr>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>
                Symbol
              </Th>
              <Th onClick={() => toggleSort("fundingRate")} active={sortKey === "fundingRate"} dir={sortDir}>
                Funding Rate
              </Th>
              <Th onClick={() => toggleSort("countdown")} active={sortKey === "countdown"} dir={sortDir}>
                Countdown
              </Th>
              <th className="px-4 py-3">Interval</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {visiblePending.map((name) => (
              <tr key={`pending-${name}`} className="animate-pulse bg-emerald-950/10">
                <td className="px-4 py-3 font-mono font-semibold text-emerald-300">
                  {name}
                </td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-12" /></td>
                <td className="px-4 py-3 text-right text-xs text-emerald-400">
                  Adding…
                </td>
              </tr>
            ))}
            {visible.length === 0 && visiblePending.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No symbols match "{filter}"
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const rate = formatRate(row.fundingRate);
              const isDeleting = deletingId === row.id;
              const noData = row.fundingRate === null;
              return (
                <tr
                  key={row.id}
                  className={`hover:bg-neutral-900/50 ${isDeleting ? "opacity-40" : ""}`}
                >
                  <td className="px-4 py-3 font-mono font-semibold">{row.name}</td>
                  <td className={`px-4 py-3 font-mono ${rate.color}`}>
                    {noData ? <Skeleton className="h-4 w-16" /> : rate.text}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {row.nextFundingTime ? (
                      formatCountdown(row.nextFundingTime, now)
                    ) : (
                      <Skeleton className="h-4 w-20" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {row.fundingInterval ? `${row.fundingInterval}h` : <Skeleton className="h-4 w-8" />}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {timeAgo(row.updatedAt, now)}
                  </td>
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

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
}) {
  return (
    <th className="px-4 py-3">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 uppercase tracking-wide hover:text-neutral-200 ${
          active ? "text-emerald-400" : ""
        }`}
      >
        {children}
        <span className="text-[10px]">
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse rounded bg-neutral-700/60 ${className}`}
    />
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
