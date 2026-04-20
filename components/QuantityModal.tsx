"use client";

import { useEffect, useState } from "react";
import { useScheduler, TimerInput, type PersistPayload } from "./Scheduler";
import { useToast } from "./Toast";

export type OrderResult = {
  symbol: string;
  success: boolean;
  error?: string;
};

export type SymbolWithPrice = { name: string; price: number | null };

export default function QuantityModal({
  open,
  side,
  symbolCount,
  symbols,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  side: "BUY" | "SELL";
  symbolCount: number;
  symbols: SymbolWithPrice[];
  onConfirm: (qty: number) => Promise<OrderResult[] | null>;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState("0.1");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<OrderResult[]>([]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const { schedule } = useScheduler();
  const { toast } = useToast();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setError("");
      setResults([]);
      setSubmitting(false);
      setScheduleOn(false);
      setDelayMs(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting]);

  if (!open) return null;

  async function handleSubmit() {
    const val = parseFloat(qty);
    if (isNaN(val) || val <= 0) {
      setError("Enter a valid positive quantity");
      return;
    }
    setError("");
    setResults([]);

    // Scheduled execution
    if (scheduleOn && delayMs > 0) {
      const label = `${side} ${symbolCount} symbol${symbolCount !== 1 ? "s" : ""} @ qty ${val}`;
      const persist: PersistPayload = {
        type: side,
        params: { symbols: symbols.map((s) => s.name), side, quantity: val },
      };
      schedule(label, delayMs, async () => {
        const res = await onConfirm(val);
        const fails = res?.filter((r) => !r.success).length ?? 0;
        if (fails > 0) toast("error", `Scheduled ${side}: ${fails} failed`);
      }, persist);
      toast("success", `Scheduled: ${label} in ${formatDelay(delayMs)}`);
      onCancel();
      return;
    }

    setSubmitting(true);
    try {
      const res = await onConfirm(val);
      if (res) {
        const failures = res.filter((r) => !r.success);
        if (failures.length > 0) {
          setResults(failures);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isBuy = side === "BUY";
  const palette = isBuy
    ? { bg: "bg-emerald-600", hover: "hover:bg-emerald-500", ring: "ring-emerald-500/20" }
    : { bg: "bg-red-600", hover: "hover:bg-red-500", ring: "ring-red-500/20" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={submitting ? undefined : onCancel} />
      <div className={`relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl ring-1 ${palette.ring}`}>
        <h3 className="text-base font-semibold text-neutral-100">
          {side} {symbolCount} Symbol{symbolCount !== 1 ? "s" : ""}
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Enter the quantity for each market order.
        </p>

        {/* Quantity input */}
        <div className="mt-4">
          <label className="text-xs uppercase text-neutral-500">Quantity per symbol</label>
          <input
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(""); setResults([]); }}
            autoFocus
            disabled={submitting}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Min notional: <span className="text-amber-400">$5</span> per order (price x qty must exceed $5)
          </p>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>

        {/* Per-symbol value breakdown */}
        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950/40">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Symbol</th>
                <th className="px-2 py-1.5 text-right font-medium">Price</th>
                <th className="px-2 py-1.5 text-right font-medium">Value</th>
                <th className="px-2 py-1.5 text-center font-medium w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {symbols.map((s) => {
                const qtyNum = parseFloat(qty) || 0;
                const value = s.price != null ? qtyNum * s.price : null;
                const ok = value != null && value >= 5;
                const hasQty = qtyNum > 0;
                return (
                  <tr key={s.name}>
                    <td className="px-2 py-1.5 font-mono font-semibold text-neutral-200">{s.name}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                      {s.price != null ? formatPrice(s.price) : "—"}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono ${!hasQty ? "text-neutral-500" : ok ? "text-emerald-400" : "text-red-400"}`}>
                      {value != null && hasQty ? `$${value.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {hasQty && value != null && (
                        <span className={ok ? "text-emerald-400" : "text-red-400"}>
                          {ok ? "✓" : "✗"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Warning if any would fail */}
        {(() => {
          const qtyNum = parseFloat(qty) || 0;
          if (qtyNum <= 0) return null;
          const failing = symbols.filter((s) => s.price != null && qtyNum * s.price < 5);
          if (failing.length === 0) return null;
          return (
            <p className="mt-2 text-xs text-red-400">
              {failing.length} symbol{failing.length !== 1 ? "s" : ""} below $5 minimum — those orders will fail
            </p>
          );
        })()}

        {/* Error results from failed orders */}
        {results.length > 0 && (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-md border border-red-800/50 bg-red-950/30 p-3">
            <p className="mb-1 text-xs font-medium text-red-300">
              {results.length} order{results.length !== 1 ? "s" : ""} failed:
            </p>
            {results.map((r) => (
              <div key={r.symbol} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-red-400">{r.symbol}</span>
                <span className="text-neutral-400">{cleanError(r.error)}</span>
              </div>
            ))}
            {results.some((r) => r.error?.includes("notional")) && (
              <p className="mt-2 text-xs text-amber-400">
                Try increasing the quantity (min $5 per order).
              </p>
            )}
            {results.some((r) => r.error?.includes("not available on")) && (
              <p className="mt-2 text-xs text-amber-400">
                Some symbols only exist on mainnet, not on the testnet.
              </p>
            )}
          </div>
        )}

        <TimerInput
          enabled={scheduleOn}
          setEnabled={setScheduleOn}
          delayMs={delayMs}
          setDelayMs={setDelayMs}
        />

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${palette.bg} ${palette.hover}`}
          >
            {submitting && <Spinner className="h-4 w-4" />}
            {submitting ? "Placing…" : scheduleOn && delayMs > 0 ? `Schedule ${side} Order` : `Place ${side} Order`}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDelay(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(4)}`;
}

/** Strip Binance prefix from error messages for cleaner display. */
function cleanError(err?: string): string {
  if (!err) return "Unknown error";
  return err.replace(/^Binance testnet \d+:\s*/, "");
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
