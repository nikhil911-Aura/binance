"use client";

import { useEffect, useState } from "react";

export default function QuantityModal({
  open,
  side,
  symbolCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  side: "BUY" | "SELL";
  symbolCount: number;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState("0.01");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, qty]);

  if (!open) return null;

  function handleSubmit() {
    const val = parseFloat(qty);
    if (isNaN(val) || val <= 0) {
      setError("Enter a valid positive quantity");
      return;
    }
    onConfirm(val);
  }

  const isBuy = side === "BUY";
  const palette = isBuy
    ? { bg: "bg-emerald-600", hover: "hover:bg-emerald-500", ring: "ring-emerald-500/20" }
    : { bg: "bg-red-600", hover: "hover:bg-red-500", ring: "ring-red-500/20" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className={`relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl ring-1 ${palette.ring}`}>
        <h3 className="text-base font-semibold text-neutral-100">
          {side} {symbolCount} Symbol{symbolCount !== 1 ? "s" : ""}
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Enter the quantity for each market order.
        </p>
        <div className="mt-4">
          <label className="text-xs uppercase text-neutral-500">Quantity per symbol</label>
          <input
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(""); }}
            autoFocus
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${palette.bg} ${palette.hover}`}
          >
            Place {side} Order
          </button>
        </div>
      </div>
    </div>
  );
}
