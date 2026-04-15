"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type Ctx = { toast: (kind: ToastKind, message: string) => void };
const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const styles: Record<ToastKind, string> = {
    success: "border-emerald-600/60 bg-emerald-950/90 text-emerald-200",
    error: "border-red-600/60 bg-red-950/90 text-red-200",
    info: "border-neutral-600/60 bg-neutral-900/95 text-neutral-200",
  };
  const icons: Record<ToastKind, string> = {
    success: "✓",
    error: "✕",
    info: "i",
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-xl backdrop-blur transition-all duration-200 ${
        show ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      } ${styles[toast.kind]}`}
    >
      <span className="font-mono">{icons[toast.kind]}</span>
      <span className="flex-1">{toast.message}</span>
    </div>
  );
}
