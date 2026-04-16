"use client";

import { useEffect, useState } from "react";

type CloseTarget = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
};

export default function CloseModal({
  target,
  onConfirm,
  onCancel,
}: {
  target: CloseTarget | null;
  onConfirm: (id: string, quantity: number) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) {
      setQty("");
      setError("");
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onCancel]);

  if (!target) return null;

  function handleConfirm() {
    const val = parseFloat(qty);
    if (isNaN(val) || val <= 0) { setError("Enter a valid positive quantity"); return; }
    if (val > target!.quantity) { setError(`Max quantity is ${target!.quantity}`); return; }
    onConfirm(target!.id, val);
  }

  const isShort = target.side === "SELL";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl ring-1 ring-red-500/20">
        <h3 className="text-base font-semibold text-neutral-100">Close Position</h3>
        <p className="mt-1 text-sm text-neutral-400">
          Closing <span className={`font-mono font-bold ${isShort ? "text-red-400" : "text-emerald-400"}`}>{target.side}</span>{" "}
          on <span className="font-mono text-neutral-200">{target.symbol}</span>
        </p>

        <div className="mt-4">
          <label className="text-xs uppercase text-neutral-500">
            Quantity to close <span className="text-neutral-600">(max {target.quantity})</span>
          </label>
          <input
            type="number"
            step="any"
            min="0"
            max={target.quantity}
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(""); }}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
            placeholder={`Enter qty (max ${target.quantity})`}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500 placeholder:text-neutral-600"
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700">
            Cancel
          </button>
          <button onClick={handleConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
            Close Position
          </button>
        </div>
      </div>
    </div>
  );
}
