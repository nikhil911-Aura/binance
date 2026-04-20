"use client";

import { useState } from "react";
import SymbolTable from "./SymbolTable";
import OrderPanel from "./OrderPanel";
import { useToast } from "./Toast";
import type { OrderResult } from "./QuantityModal";
import { SchedulerProvider, ScheduledTasksPanel } from "./Scheduler";

type SymbolRow = {
  id: string;
  name: string;
  fundingRate: number | null;
  nextFundingTime: string | null;
  fundingInterval: number | null;
  markPrice: number | null;
  updatedAt?: string;
};
type OrderRow = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number | null;
  exitPrice: number | null;
  profit: number | null;
  binanceOrderId: string | null;
  pendingCloseOrderId: string | null;
  pendingClosePrice: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function Dashboard({
  initialSymbols,
  initialOrders,
}: {
  initialSymbols: SymbolRow[];
  initialOrders: OrderRow[];
}) {
  const [orderVersion, setOrderVersion] = useState(0);
  const { toast } = useToast();

  /** Returns results array so QuantityModal can display per-symbol errors. */
  async function handlePlaceOrders(
    symbols: string[],
    side: "BUY" | "SELL",
    quantity: number,
    price?: number,
  ): Promise<OrderResult[] | null> {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, side, quantity, ...(price != null && { price }) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to place orders");
        return null;
      }
      const { results, successCount, failCount } = data as {
        results: OrderResult[];
        successCount: number;
        failCount: number;
      };
      if (successCount > 0) {
        toast(
          "success",
          `${side} placed: ${successCount} success${failCount > 0 ? `, ${failCount} failed` : ""}`,
        );
        setOrderVersion((v) => v + 1);
      }
      if (failCount > 0 && successCount === 0) {
        toast("error", `All ${failCount} orders failed — see details below`);
      }
      return results;
    } catch {
      toast("error", "Network error placing orders");
      return null;
    }
  }

  return (
    <SchedulerProvider>
      <section className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SymbolTable
            initial={initialSymbols}
            onPlaceOrders={handlePlaceOrders}
          />
        </div>
        <div className="lg:col-span-2">
          <OrderPanel initialOrders={initialOrders} refreshKey={orderVersion} />
        </div>
      </section>
      <ScheduledTasksPanel />
    </SchedulerProvider>
  );
}
