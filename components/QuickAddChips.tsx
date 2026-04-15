"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";

const SUGGESTIONS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];

export default function QuickAddChips() {
  const [adding, setAdding] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  async function add(name: string) {
    setAdding(name);
    try {
      const res = await fetch("/api/symbols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to add");
      } else {
        toast("success", `Added ${data.name}`);
        startTransition(() => router.refresh());
      }
    } catch {
      toast("error", "Network error");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => add(s)}
          disabled={adding !== null}
          className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 font-mono text-xs text-neutral-200 transition hover:border-emerald-600 hover:bg-emerald-950/40 hover:text-emerald-300 disabled:opacity-50"
        >
          {adding === s ? "Adding…" : `+ ${s}`}
        </button>
      ))}
    </div>
  );
}
