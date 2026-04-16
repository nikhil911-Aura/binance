"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import ConfirmDialog from "./ConfirmDialog";

type OrderRow = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number | null;
  exitPrice: number | null;
  binanceOrderId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function OrderPanel({
  initialOrders,
  refreshKey,
}: {
  initialOrders: OrderRow[];
  refreshKey: number;
}) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [confirmClose, setConfirmClose] = useState<string[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  async function fetchOrders(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/orders?status=OPEN", { cache: "no-store" });
      if (res.ok) setOrders(await res.json());
    } catch {
      /* skip */
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }

  // Refresh when parent signals new orders placed
  useEffect(() => {
    fetchOrders(false);
  }, [refreshKey]);

  // Auto-poll orders every 10s
  useEffect(() => {
    const id = setInterval(() => fetchOrders(false), 10_000);
    return () => clearInterval(id);
  }, []);

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.id)));
  }

  async function performClose(ids: string[]) {
    setConfirmClose(null);
    setClosing(true);
    setClosingIds(new Set(ids));
    try {
      const res = await fetch("/api/orders/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to close orders");
        return;
      }
      const { successCount, failCount } = data;
      if (successCount > 0) {
        toast("success", `Closed ${successCount} order${successCount !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} failed)` : ""}`);
      }
      if (failCount > 0 && successCount === 0) {
        toast("error", `All ${failCount} close attempts failed`);
      }
      setSelected(new Set());
      await fetchOrders(false);
    } catch {
      toast("error", "Network error closing orders");
    } finally {
      setClosing(false);
      setClosingIds(new Set());
    }
  }

  const openOrders = orders.filter((o) => o.status === "OPEN");

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <ConfirmDialog
        open={confirmClose !== null}
        title="Close orders?"
        message={<>Close <span className="font-semibold text-neutral-200">{confirmClose?.length ?? 0}</span> order{(confirmClose?.length ?? 0) !== 1 ? "s" : ""}? Opposite market orders will be placed on the testnet.</>}
        confirmLabel="Close Orders"
        kind="danger"
        onConfirm={() => confirmClose && performClose(confirmClose)}
        onCancel={() => setConfirmClose(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">Orders</span>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {openOrders.length} open
          </span>
          {selected.size > 0 && (
            <span className="text-xs text-emerald-400">{selected.size} selected</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setConfirmClose(Array.from(selected))}
              disabled={closing}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              Close Selected
            </button>
          )}
          <button
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="flex items-center gap-1 rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            {refreshing && <Spinner className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Empty state */}
      {openOrders.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-lg">
            📋
          </div>
          <p className="text-sm text-neutral-400">No open orders</p>
          <p className="mt-1 text-xs text-neutral-500">
            Select symbols on the left and click Buy/Sell.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={openOrders.length > 0 && selected.size === openOrders.length}
                    onChange={toggleAll}
                    className="accent-emerald-500"
                  />
                </th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {openOrders.map((order) => {
                const isBuy = order.side === "BUY";
                const isClosing = closingIds.has(order.id);
                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-neutral-900/50 ${isClosing ? "opacity-40" : ""} ${selected.has(order.id) ? "bg-emerald-950/10" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="accent-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-neutral-200">
                      {order.symbol}
                    </td>
                    <td className={`px-3 py-2 font-mono text-xs font-bold ${isBuy ? "text-emerald-400" : "text-red-400"}`}>
                      {order.side}
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-300">
                      {order.quantity}
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-400">
                      {order.entryPrice != null ? `$${order.entryPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setConfirmClose([order.id])}
                        disabled={isClosing || closing}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {isClosing ? "Closing…" : "Close"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
