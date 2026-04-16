"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import ConfirmDialog from "./ConfirmDialog";
import CloseModal from "./CloseModal";

type OrderRow = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number | null;
  exitPrice: number | null;
  profit: number | null;
  binanceOrderId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Tab = "open" | "history" | "profit";
type CloseTarget = { id: string; symbol: string; side: string; quantity: number };

/** Returns the closing action side — opposite of the stored position side. */
function closingSide(side: string) {
  return side === "BUY" ? "SELL" : "BUY";
}

export default function OrderPanel({
  initialOrders,
  refreshKey,
}: {
  initialOrders: OrderRow[];
  refreshKey: number;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [openOrders, setOpenOrders] = useState<OrderRow[]>(initialOrders);
  const [closedOrders, setClosedOrders] = useState<OrderRow[]>([]);
  const [closedLoaded, setClosedLoaded] = useState(false);
  const [closedLoading, setClosedLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [confirmClose, setConfirmClose] = useState<string[] | null>(null);
  const [closeTarget, setCloseTarget] = useState<CloseTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  // Keep a stable ref so interval callback always sees latest orders
  const openOrdersRef = useRef(openOrders);
  openOrdersRef.current = openOrders;

  async function fetchOpenOrders(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/orders?status=OPEN", { cache: "no-store" });
      if (res.ok) {
        const data: OrderRow[] = await res.json();
        setOpenOrders(data);
      }
    } catch { /* skip */ }
    finally { if (showSpinner) setRefreshing(false); }
  }

  async function fetchClosedOrders(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    setClosedLoading(true);
    try {
      const res = await fetch("/api/orders?status=CLOSED", { cache: "no-store" });
      if (res.ok) { setClosedOrders(await res.json()); setClosedLoaded(true); }
    } catch { /* skip */ }
    finally { setClosedLoading(false); if (showSpinner) setRefreshing(false); }
  }

  useEffect(() => { fetchOpenOrders(false); }, [refreshKey]);
  useEffect(() => {
    const id = setInterval(() => fetchOpenOrders(false), 10_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if ((tab === "history" || tab === "profit") && !closedLoaded) {
      fetchClosedOrders(false);
    }
  }, [tab]);

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === openOrders.length) setSelected(new Set());
    else setSelected(new Set(openOrders.map((o) => o.id)));
  }

  async function performCloseSingle(id: string, quantity: number) {
    setCloseTarget(null);
    await performClose([{ id, quantity }]);
  }

  async function performClose(orders: { id: string; quantity?: number }[]) {
    setConfirmClose(null);
    setClosing(true);
    setClosingIds(new Set(orders.map((o) => o.id)));
    try {
      const res = await fetch("/api/orders/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      const data = await res.json();
      if (!res.ok) { toast("error", data.error ?? "Failed to close orders"); return; }
      const { successCount, failCount } = data;
      if (successCount > 0) {
        toast("success", `Closed ${successCount} order${successCount !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} failed)` : ""}`);
      }
      if (failCount > 0 && successCount === 0) toast("error", `All ${failCount} close attempts failed`);
      setSelected(new Set());
      // Small delay to let DB writes propagate before re-fetching
      await new Promise((r) => setTimeout(r, 400));
      await fetchOpenOrders(false);
      if (closedLoaded) await fetchClosedOrders(false);
    } catch { toast("error", "Network error closing orders"); }
    finally { setClosing(false); setClosingIds(new Set()); }
  }

  function handleBulkClose() {
    const ids = openOrders.filter((o) => selected.has(o.id)).map((o) => o.id);
    if (ids.length > 0) setConfirmClose(ids);
  }

  // Profit tab aggregation
  const profitBySymbol = buildProfitBySymbol(closedOrders);
  const totalPnl = profitBySymbol.reduce((s, r) => s + r.totalProfit, 0);
  const totalWins = profitBySymbol.reduce((s, r) => s + r.wins, 0);
  const totalLosses = profitBySymbol.reduce((s, r) => s + r.losses, 0);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "open", label: "Open", count: openOrders.length },
    { key: "history", label: "History", count: closedLoaded ? closedOrders.length : undefined },
    { key: "profit", label: "Profit / Loss", count: closedLoaded ? profitBySymbol.length : undefined },
  ];

  return (
    <>
      {/* Modals rendered OUTSIDE the overflow-hidden container */}
      <ConfirmDialog
        open={confirmClose !== null}
        title="Close orders?"
        message={<>Close <span className="font-semibold text-neutral-200">{confirmClose?.length ?? 0}</span> order{(confirmClose?.length ?? 0) !== 1 ? "s" : ""}? Opposite market orders will be placed on the testnet.</>}
        confirmLabel="Close Orders"
        kind="danger"
        onConfirm={() => confirmClose && performClose(confirmClose.map((id) => ({ id })))}
        onCancel={() => setConfirmClose(null)}
      />
      <CloseModal
        target={closeTarget}
        onConfirm={performCloseSingle}
        onCancel={() => setCloseTarget(null)}
      />

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        {/* Tab bar */}
        <div className="border-b border-neutral-800 bg-neutral-900">
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="flex gap-1">
              {tabs.map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => { setTab(key); setSelected(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    tab === key
                      ? "border-b-2 border-emerald-500 text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {label}
                  {count !== undefined && (
                    <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === key ? "bg-neutral-700 text-neutral-300" : "bg-neutral-800 text-neutral-500"}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pb-2">
              {tab === "open" && selected.size > 0 && (
                <button onClick={handleBulkClose} disabled={closing}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50">
                  Close {selected.size} Selected
                </button>
              )}
              <button
                onClick={() => tab === "open" ? fetchOpenOrders(true) : fetchClosedOrders(true)}
                disabled={refreshing}
                className="flex items-center gap-1 rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
              >
                {refreshing && <Spinner className="h-3 w-3" />}
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* ── OPEN TAB ── */}
        {tab === "open" && (
          openOrders.length === 0 ? (
            <EmptyState icon="📋" title="No open orders" sub="Select symbols and click Buy / Sell." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900 text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input type="checkbox"
                        checked={openOrders.length > 0 && selected.size === openOrders.length}
                        onChange={toggleAll} className="accent-emerald-500" />
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
                    const isClosingRow = closingIds.has(order.id);
                    return (
                      <tr key={order.id} className={`hover:bg-neutral-900/50 ${isClosingRow ? "opacity-40" : ""} ${selected.has(order.id) ? "bg-emerald-950/10" : ""}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(order.id)}
                            onChange={() => toggleSelect(order.id)} className="accent-emerald-500" />
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-neutral-200">{order.symbol}</td>
                        <td className={`px-3 py-2 font-mono text-xs font-bold ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{order.side}</td>
                        <td className="px-3 py-2 font-mono text-neutral-300">{order.quantity}</td>
                        <td className="px-3 py-2 font-mono text-neutral-400">
                          {order.entryPrice != null ? `$${order.entryPrice.toFixed(4)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setCloseTarget({ id: order.id, symbol: order.symbol, side: order.side, quantity: order.quantity })}
                            disabled={isClosingRow || closing}
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            {isClosingRow ? "Closing…" : "Close"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          closedLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400">
              <Spinner className="h-4 w-4" /> Loading…
            </div>
          ) : closedOrders.length === 0 ? (
            <EmptyState icon="📄" title="No closed orders" sub="Closed orders will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900 text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">Exit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {closedOrders.map((order) => {
                    // Show the CLOSING action side (opposite of position side)
                    const actionSide = closingSide(order.side);
                    const isBuyAction = actionSide === "BUY";
                    return (
                      <tr key={order.id} className="hover:bg-neutral-900/50">
                        <td className="px-3 py-2 font-mono font-semibold text-neutral-200">{order.symbol}</td>
                        <td className={`px-3 py-2 font-mono text-xs font-bold ${isBuyAction ? "text-emerald-400" : "text-red-400"}`}>
                          {actionSide}
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-300">{order.quantity}</td>
                        <td className="px-3 py-2 font-mono text-neutral-400">
                          {order.entryPrice != null ? `$${order.entryPrice.toFixed(4)}` : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-400">
                          {order.exitPrice != null ? `$${order.exitPrice.toFixed(4)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── PROFIT / LOSS TAB ── */}
        {tab === "profit" && (
          closedLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400">
              <Spinner className="h-4 w-4" /> Loading…
            </div>
          ) : profitBySymbol.length === 0 ? (
            <EmptyState icon="💰" title="No profit data yet" sub="Close an order to see your P&L here." />
          ) : (
            <>
              <div className="flex items-center gap-5 border-b border-neutral-800 bg-neutral-950/50 px-4 py-3">
                <div>
                  <p className="text-xs text-neutral-500">Total PnL</p>
                  <p className={`font-mono text-sm font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)} USDT
                  </p>
                </div>
                <div className="h-6 w-px bg-neutral-800" />
                <div>
                  <p className="text-xs text-neutral-500">Win / Loss</p>
                  <p className="text-sm">
                    <span className="font-mono font-medium text-emerald-400">{totalWins}W</span>
                    <span className="mx-1 text-neutral-600">/</span>
                    <span className="font-mono font-medium text-red-400">{totalLosses}L</span>
                  </p>
                </div>
                <div className="h-6 w-px bg-neutral-800" />
                <div>
                  <p className="text-xs text-neutral-500">Symbols</p>
                  <p className="font-mono text-sm font-medium text-neutral-300">{profitBySymbol.length}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900 text-left text-xs uppercase text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2 text-center">Trades</th>
                      <th className="px-3 py-2 text-right">Total Qty</th>
                      <th className="px-3 py-2 text-center">W / L</th>
                      <th className="px-3 py-2 text-right">Profit / Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {profitBySymbol.map((row) => (
                      <tr key={row.symbol} className="hover:bg-neutral-900/50">
                        <td className="px-3 py-2 font-mono font-semibold text-neutral-200">{row.symbol}</td>
                        <td className="px-3 py-2 text-center font-mono text-neutral-400">{row.trades}</td>
                        <td className="px-3 py-2 text-right font-mono text-neutral-400">{row.totalQty}</td>
                        <td className="px-3 py-2 text-center text-xs">
                          <span className="font-mono font-medium text-emerald-400">{row.wins}W</span>
                          <span className="mx-1 text-neutral-600">/</span>
                          <span className="font-mono font-medium text-red-400">{row.losses}L</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-mono text-sm font-semibold ${row.totalProfit > 0 ? "text-emerald-400" : row.totalProfit < 0 ? "text-red-400" : "text-neutral-400"}`}>
                            {row.totalProfit >= 0 ? "+" : ""}{row.totalProfit.toFixed(4)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>
    </>
  );
}

type SymbolProfit = {
  symbol: string;
  trades: number;
  totalQty: number;
  wins: number;
  losses: number;
  totalProfit: number;
};

function buildProfitBySymbol(orders: OrderRow[]): SymbolProfit[] {
  const map = new Map<string, SymbolProfit>();
  for (const o of orders) {
    if (o.profit === null) continue;
    const existing = map.get(o.symbol) ?? { symbol: o.symbol, trades: 0, totalQty: 0, wins: 0, losses: 0, totalProfit: 0 };
    existing.trades += 1;
    existing.totalQty += o.quantity;
    existing.totalProfit += o.profit;
    if (o.profit > 0) existing.wins += 1;
    else if (o.profit < 0) existing.losses += 1;
    map.set(o.symbol, existing);
  }
  return [...map.values()].sort((a, b) => b.totalProfit - a.totalProfit);
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="p-8 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-lg">{icon}</div>
      <p className="text-sm text-neutral-400">{title}</p>
      <p className="mt-1 text-xs text-neutral-500">{sub}</p>
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
