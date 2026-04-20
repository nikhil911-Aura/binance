"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type ScheduledTask = {
  id: string;
  label: string;
  executeAt: number;
};

type SchedulerContextType = {
  tasks: ScheduledTask[];
  schedule: (label: string, delayMs: number, callback: () => void | Promise<void>) => string;
  cancel: (id: string) => void;
};

const SchedulerContext = createContext<SchedulerContextType | null>(null);

export function SchedulerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [timeouts] = useState(() => new Map<string, ReturnType<typeof setTimeout>>());

  const schedule = useCallback(
    (label: string, delayMs: number, callback: () => void | Promise<void>) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const executeAt = Date.now() + delayMs;
      const timeoutId = setTimeout(async () => {
        timeouts.delete(id);
        setTasks((t) => t.filter((task) => task.id !== id));
        try {
          await callback();
        } catch (e) {
          console.error("[scheduler] task failed:", e);
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
    },
    [timeouts],
  );

  return (
    <SchedulerContext.Provider value={{ tasks, schedule, cancel }}>
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
  const { tasks, cancel } = useScheduler();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (tasks.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [tasks.length]);

  if (tasks.length === 0) return null;

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

/** Reusable timer input — HH:MM:SS format. Returns delayMs (0 when disabled). */
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
  const [input, setInput] = useState("00:00:30");

  function update(next: string) {
    setInput(next);
    setDelayMs(parseHMS(next));
  }

  // Sync initial value when enabled is toggled on
  useEffect(() => {
    if (enabled && delayMs === 0) {
      setDelayMs(parseHMS(input));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const isValid = delayMs > 0 || !enabled;

  return (
    <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-amber-500"
        />
        <span className="flex items-center gap-1">
          ⏱ <span>Schedule for later</span>
        </span>
      </label>
      {enabled && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => update(e.target.value)}
              placeholder="HH:MM:SS"
              pattern="[0-9]{1,2}:[0-9]{2}:[0-9]{2}"
              className={`w-32 rounded border bg-neutral-950 px-2 py-1 text-center font-mono text-sm outline-none focus:border-amber-500 ${isValid ? "border-neutral-700" : "border-red-500"}`}
            />
            <span className="text-xs text-neutral-500">from now (HH:MM:SS)</span>
          </div>
          {!isValid && (
            <p className="mt-1 text-xs text-red-400">
              Invalid format — use HH:MM:SS (e.g. 00:01:30 for 1m 30s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
