"use client";

import { useState } from "react";
import { useToast } from "./Toast";

export default function PriceHistorySync() {
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  async function handleSync() {
    setSyncing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch("/api/price-history/sync", {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const msg = data.totalInserted === 0
        ? "Price history already up to date"
        : `Synced +${data.totalInserted.toLocaleString()} candles`;
      toast("success", msg);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast("success", "Sync running in background — check back shortly");
      } else {
        const msg = e instanceof Error ? e.message : "Sync failed";
        toast("error", msg);
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
    >
      {syncing && (
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {syncing ? "Syncing…" : "Sync Price History"}
    </button>
  );
}
