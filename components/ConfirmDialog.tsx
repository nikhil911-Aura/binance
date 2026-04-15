"use client";

import { useEffect } from "react";

export type ConfirmKind = "danger" | "info";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  kind = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: ConfirmKind;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const palette =
    kind === "danger"
      ? {
          ring: "ring-red-500/20",
          iconBg: "bg-red-500/10 text-red-400",
          confirmBtn:
            "bg-red-600 hover:bg-red-500 focus:ring-red-400/40 text-white",
          icon: "⚠",
        }
      : {
          ring: "ring-emerald-500/20",
          iconBg: "bg-emerald-500/10 text-emerald-400",
          confirmBtn:
            "bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-400/40 text-white",
          icon: "?",
        };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-[fadeIn_0.15s_ease-out]"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl ring-1 ${palette.ring} animate-[scaleIn_0.18s_ease-out]`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold ${palette.iconBg}`}
          >
            {palette.icon}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-neutral-100">{title}</h3>
            <div className="mt-1 text-sm text-neutral-400">{message}</div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 ${palette.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
