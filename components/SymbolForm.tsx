"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";

export default function SymbolForm() {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const router = useRouter();
  const { toast } = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!showSuggestions) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoadingSuggestions(true);
      try {
        const res = await fetch(
          `/api/symbols/search?q=${encodeURIComponent(value)}`,
          { signal: ctrl.signal },
        );
        if (res.ok) {
          setSuggestions(await res.json());
          setActiveIndex(-1);
        }
      } catch {
        /* aborted */
      } finally {
        setLoadingSuggestions(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, showSuggestions]);

  async function submit(name: string) {
    if (!name) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/symbols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to add symbol");
        return;
      }
      setValue("");
      setSuggestions([]);
      setShowSuggestions(false);
      toast("success", `Added ${data.name}`);
      startTransition(() => router.refresh());
    } catch {
      toast("error", "Network error — check connection");
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit(value.trim().toUpperCase());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = activeIndex >= 0 ? suggestions[activeIndex] : value.trim().toUpperCase();
      submit(pick);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  const busy = submitting || pending;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase());
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={onKeyDown}
            placeholder="Search symbol — e.g. BTC, ETHUSDT"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 pr-9 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
            maxLength={20}
            disabled={busy}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
          />
          {loadingSuggestions && (
            <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          )}
        </div>
        <button
          type="button"
          onClick={() => submit(value.trim().toUpperCase())}
          disabled={busy || !value.trim()}
          className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner className="h-4 w-4" />}
          {submitting ? "Adding…" : "Add Symbol"}
        </button>
      </div>

      {showSuggestions && (suggestions.length > 0 || loadingSuggestions) && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-xl sm:w-[calc(100%-8.5rem)]">
          {loadingSuggestions && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-neutral-400">Searching…</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault();
                  submit(s);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`cursor-pointer px-3 py-2 font-mono text-sm ${
                  i === activeIndex
                    ? "bg-emerald-600/20 text-emerald-300"
                    : "text-neutral-200 hover:bg-neutral-800"
                }`}
              >
                {s}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
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
