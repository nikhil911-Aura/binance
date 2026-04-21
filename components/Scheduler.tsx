"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type ScheduledTask = {
  id: string;
  label: string;
  executeAt: number;
};

export type PersistPayload = {
  type: "BUY" | "SELL" | "CLOSE_SINGLE" | "CLOSE_ALL";
  params: Record<string, unknown>;
};

type SchedulerContextType = {
  tasks: ScheduledTask[];
  loading: boolean;
  schedule: (
    label: string,
    delayMs: number,
    callback: () => void | Promise<void>,
    persist?: PersistPayload,
  ) => string;
  cancel: (id: string) => void;
};

const SchedulerContext = createContext<SchedulerContextType | null>(null);

function buildCallback(type: string, params: Record<string, unknown>): () => Promise<void> {
  if (type === "BUY" || type === "SELL") {
    const { symbols, side, quantity } = params as { symbols: string[]; side: string; quantity: number };
    return () =>
      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, side, quantity }),
      }).then(() => {});
  }
  if (type === "CLOSE_SINGLE") {
    const { orderId, quantity } = params as { orderId: string; quantity: number };
    return () =>
      fetch("/api/orders/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: [{ id: orderId, quantity }] }),
      }).then(() => {});
  }
  if (type === "CLOSE_ALL") {
    const { orderIds } = params as { orderIds: string[] };
    return () =>
      fetch("/api/orders/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: (orderIds as string[]).map((id) => ({ id })) }),
      }).then(() => {});
  }
  return async () => {};
}

export function SchedulerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeouts] = useState(() => new Map<string, ReturnType<typeof setTimeout>>());

  // Recover persisted tasks on mount
  useEffect(() => {
    fetch("/api/scheduled")
      .then((r) => r.json())
      .then(
        (
          dbTasks: Array<{
            id: string;
            label: string;
            executeAt: string;
            type: string;
            params: Record<string, unknown>;
          }>,
        ) => {
          if (!Array.isArray(dbTasks) || dbTasks.length === 0) return;
          const now = Date.now();
          for (const task of dbTasks) {
            const executeAt = new Date(task.executeAt).getTime();
            const remaining = Math.max(0, executeAt - now);
            const id = task.id;
            const callback = buildCallback(task.type, task.params);

            const timeoutId = setTimeout(async () => {
              timeouts.delete(id);
              setTasks((t) => t.filter((x) => x.id !== id));
              try {
                await callback();
              } catch (e) {
                console.error("[scheduler] recovered task failed:", e);
              }
              fetch(`/api/scheduled/${id}`, { method: "DELETE" }).catch(() => {});
            }, remaining);

            timeouts.set(id, timeoutId);
            setTasks((t) => {
              if (t.some((x) => x.id === id)) return t;
              return [...t, { id, label: task.label, executeAt }];
            });
          }
        },
      )
      .catch((e) => console.error("[scheduler] failed to recover tasks:", e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useCallback(
    (
      label: string,
      delayMs: number,
      callback: () => void | Promise<void>,
      persist?: PersistPayload,
    ): string => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const executeAt = Date.now() + delayMs;

      if (persist) {
        fetch("/api/scheduled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, label, executeAt, type: persist.type, params: persist.params }),
        }).catch((e) => console.error("[scheduler] failed to persist task:", e));
      }

      const timeoutId = setTimeout(async () => {
        timeouts.delete(id);
        setTasks((t) => t.filter((task) => task.id !== id));
        try {
          await callback();
        } catch (e) {
          console.error("[scheduler] task failed:", e);
        }
        if (persist) {
          fetch(`/api/scheduled/${id}`, { method: "DELETE" }).catch(() => {});
        }
      }, delayMs);
      timeouts.set(id, timeoutId);
      setTasks((t) => [...t, { id, label, executeAt }]);
      return id;
    },
    [timeouts],
  );

  const cancel = useCallback(
    (id: string) => {
      const timeoutId = timeouts.get(id);
      if (timeoutId) clearTimeout(timeoutId);
      timeouts.delete(id);
      setTasks((t) => t.filter((x) => x.id !== id));
      fetch(`/api/scheduled/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [timeouts],
  );

  return (
    <SchedulerContext.Provider value={{ tasks, loading, schedule, cancel }}>
      {children}
    </SchedulerContext.Provider>
  );
}

export function useScheduler() {
  const ctx = useContext(SchedulerContext);
  if (!ctx) throw new Error("useScheduler must be used within SchedulerProvider");
  return ctx;
}

export function ScheduledTasksPanel() {
  const { tasks, loading, cancel } = useScheduler();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (tasks.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [tasks.length]);

  if (loading || tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-amber-800/50 bg-neutral-900 shadow-2xl ring-1 ring-amber-500/20">
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-amber-950/30 px-3 py-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-300">
          Scheduled ({tasks.length})
        </h4>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {tasks.map((task) => {
          const remaining = Math.max(0, task.executeAt - now);
          const totalSec = Math.ceil(remaining / 1000);
          const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
          const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
          const ss = String(totalSec % 60).padStart(2, "0");
          const display = `${hh}:${mm}:${ss}`;
          return (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-200">{task.label}</p>
                <p className="mt-0.5 font-mono text-xs text-amber-400">in {display}</p>
              </div>
              <button
                onClick={() => cancel(task.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
              >
                Cancel
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Parse HH:MM:SS string to milliseconds. Returns 0 if invalid. */
function parseHMS(input: string): number {
  const parts = input.split(":").map((p) => p.trim());
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map((p) => parseInt(p, 10));
  if ([h, m, s].some((n) => isNaN(n) || n < 0)) return 0;
  if (m >= 60 || s >= 60) return 0;
  return (h * 3600 + m * 60 + s) * 1000;
}

function parseTargetTime(input: string): number {
  const parts = input.split(":").map((p) => p.trim());
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map((p) => parseInt(p, 10));
  if ([h, m, s].some((n) => isNaN(n) || n < 0)) return 0;
  if (h > 23 || m >= 60 || s >= 60) return 0;

  const now = new Date();
  const target = new Date();
  target.setHours(h, m, s, 0);

  // If target time is in the past, assume next day
  if (target <= now) target.setDate(target.getDate() + 1);

  return target.getTime() - now.getTime();
}

/** Reusable timer input — supports countdown (HH:MM:SS) and target time modes. */
export function TimerInput({
  enabled,
  setEnabled,
  delayMs,
  setDelayMs,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  delayMs: number;
  setDelayMs: (ms: number) => void;
}) {
  const [mode, setMode] = useState<"countdown" | "target">("countdown");
  const [countdownInput, setCountdownInput] = useState("00:00:30");
  const [targetInput, setTargetInput] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  });
  const [targetDelayMs, setTargetDelayMs] = useState(0);

  function updateCountdown(next: string) {
    setCountdownInput(next);
    setDelayMs(parseHMS(next));
  }

  function updateTarget(next: string) {
    setTargetInput(next);
    const ms = parseTargetTime(next);
    setTargetDelayMs(ms);
    setDelayMs(ms);
  }

  useEffect(() => {
    if (!enabled) return;
    if (mode === "countdown") setDelayMs(parseHMS(countdownInput));
    else {
      const ms = parseTargetTime(targetInput);
      setTargetDelayMs(ms);
      setDelayMs(ms);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mode]);

  // Recalculate target delay every second so countdown label stays fresh
  useEffect(() => {
    if (!enabled || mode !== "target") return;
    const id = setInterval(() => {
      const ms = parseTargetTime(targetInput);
      setTargetDelayMs(ms);
      setDelayMs(ms);
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, mode, targetInput, setDelayMs]);

  const countdownValid = !enabled || parseHMS(countdownInput) > 0;
  const targetValid = !enabled || parseTargetTime(targetInput) > 0;
  const isValid = mode === "countdown" ? countdownValid : targetValid;

  function formatMs(ms: number) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  return (
    <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-amber-500"
        />
        <span className="flex items-center gap-1">⏱ Schedule for later</span>
      </label>

      {enabled && (
        <div className="mt-2 space-y-2">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-neutral-700 text-xs font-medium overflow-hidden w-fit">
            <button
              onClick={() => setMode("countdown")}
              className={`px-3 py-1.5 transition-colors ${mode === "countdown" ? "bg-amber-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
            >
              Countdown
            </button>
            <button
              onClick={() => setMode("target")}
              className={`px-3 py-1.5 border-l border-neutral-700 transition-colors ${mode === "target" ? "bg-amber-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
            >
              Target Time
            </button>
          </div>

          {mode === "countdown" ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={countdownInput}
                onChange={(e) => updateCountdown(e.target.value)}
                placeholder="HH:MM:SS"
                className={`w-32 rounded border bg-neutral-950 px-2 py-1 text-center font-mono text-sm outline-none focus:border-amber-500 ${countdownValid ? "border-neutral-700" : "border-red-500"}`}
              />
              <span className="text-xs text-neutral-500">from now</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={targetInput}
                  onChange={(e) => updateTarget(e.target.value)}
                  placeholder="HH:MM:SS"
                  className={`w-32 rounded border bg-neutral-950 px-2 py-1 text-center font-mono text-sm outline-none focus:border-amber-500 ${targetValid ? "border-neutral-700" : "border-red-500"}`}
                />
                <span className="text-xs text-neutral-500">today / tomorrow</span>
              </div>
              {targetDelayMs > 0 && (
                <p className="text-xs text-amber-400">
                  Executes in {formatMs(targetDelayMs)}
                </p>
              )}
            </div>
          )}

          {!isValid && (
            <p className="text-xs text-red-400">
              {mode === "countdown"
                ? "Invalid format — use HH:MM:SS (e.g. 00:01:30)"
                : "Invalid time — use HH:MM:SS (e.g. 16:29:55)"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
