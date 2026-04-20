import { prisma } from "./prisma";
import { placeMarketOrder, placeLimitOrder, closePosition, isTestnetSymbol, getMarkPrice, getOrderStatus, cancelLimitOrder } from "./binanceTestnet";

export type PlaceOrderInput = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price?: number; // undefined = market order, set = limit order
};

export type PlaceResult = {
  symbol: string;
  success: boolean;
  orderId?: string;
  error?: string;
};

/** Place market orders for multiple symbols in parallel. */
export async function placeOrders(
  inputs: PlaceOrderInput[],
): Promise<PlaceResult[]> {
  const results = await Promise.allSettled(
    inputs.map(async ({ symbol, side, quantity, price }): Promise<PlaceResult> => {
      // Pre-validate: check if symbol exists on testnet
      const valid = await isTestnetSymbol(symbol);
      if (!valid) {
        throw new Error(`${symbol} is not available on the Binance testnet`);
      }

      const res = price != null
        ? await placeLimitOrder(symbol, side, quantity, price)
        : await placeMarketOrder(symbol, side, quantity);

      // For limit orders use the specified price; for market fall back to mark price
      let entryPrice = parseFloat(res.avgPrice) || 0;
      if (entryPrice === 0) {
        if (price != null) {
          entryPrice = price;
        } else {
          try {
            entryPrice = await getMarkPrice(symbol);
          } catch {
            entryPrice = 0;
          }
        }
      }

      const isLimit = price != null;
      const order = await prisma.order.create({
        data: {
          symbol,
          side,
          quantity,
          entryPrice: isLimit ? price : (entryPrice > 0 ? entryPrice : null),
          binanceOrderId: String(res.orderId),
          status: isLimit ? "PENDING" : "OPEN",
        },
      });

      return { symbol, success: true, orderId: order.id };
    }),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const err = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.error(`[order] ${inputs[i].symbol} failed:`, err);
    return { symbol: inputs[i].symbol, success: false, error: err };
  });
}

/** Close orders: place opposite market orders and mark CLOSED.
 *  Each input may specify a custom quantity; falls back to the stored quantity.
 */
export async function closeOrders(
  inputs: { id: string; quantity?: number }[],
): Promise<PlaceResult[]> {
  const ids = inputs.map((i) => i.id);
  const qtyOverride = new Map(inputs.map((i) => [i.id, i.quantity]));

  const orders = await prisma.order.findMany({
    where: { id: { in: ids }, status: "OPEN" },
  });

  if (orders.length === 0) return [];

  const results = await Promise.allSettled(
    orders.map(async (order): Promise<PlaceResult> => {
      const closeQty = qtyOverride.get(order.id) ?? order.quantity;

      const res = await closePosition(
        order.symbol,
        order.side as "BUY" | "SELL",
        closeQty,
      );

      // Get exit price, fall back to mark price if avgPrice is 0
      let exitPrice = parseFloat(res.avgPrice) || 0;
      if (exitPrice === 0) {
        try {
          exitPrice = await getMarkPrice(order.symbol);
        } catch {
          exitPrice = 0;
        }
      }

      // Calculate profit using the actual close quantity
      let profit: number | null = null;
      if (exitPrice > 0 && order.entryPrice != null && order.entryPrice > 0) {
        profit =
          order.side === "BUY"
            ? (exitPrice - order.entryPrice) * closeQty
            : (order.entryPrice - exitPrice) * closeQty;
      }

      const isPartial = closeQty < order.quantity;

      if (isPartial) {
        // Partial close: reduce original order qty, create a new CLOSED record
        await prisma.order.update({
          where: { id: order.id },
          data: { quantity: order.quantity - closeQty },
        });

        await prisma.order.create({
          data: {
            symbol: order.symbol,
            side: order.side,
            quantity: closeQty,
            entryPrice: order.entryPrice,
            exitPrice: exitPrice > 0 ? exitPrice : null,
            binanceOrderId: order.binanceOrderId,
            status: "CLOSED",
            profit,
          },
        });
      } else {
        // Full close: mark the order as CLOSED
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "CLOSED",
            exitPrice: exitPrice > 0 ? exitPrice : null,
            profit,
          },
        });
      }

      return { symbol: order.symbol, success: true, orderId: order.id };
    }),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const err = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.error(`[order] close ${orders[i].symbol} failed:`, err);
    return { symbol: orders[i].symbol, success: false, error: err };
  });
}

/** Check all PENDING limit orders against Binance and promote filled ones to OPEN. */
export async function syncPendingOrders() {
  const pending = await prisma.order.findMany({ where: { status: "PENDING" } });
  if (pending.length === 0) return { filled: 0 };

  let filled = 0;
  await Promise.allSettled(
    pending.map(async (order) => {
      if (!order.binanceOrderId) return;
      try {
        const info = await getOrderStatus(order.symbol, order.binanceOrderId);
        if (info.status === "FILLED") {
          const fillPrice = parseFloat(info.avgPrice) || order.entryPrice || 0;
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "OPEN", entryPrice: fillPrice > 0 ? fillPrice : order.entryPrice },
          });
          filled++;
        } else if (info.status === "CANCELED" || info.status === "EXPIRED") {
          await prisma.order.delete({ where: { id: order.id } });
        }
      } catch (e) {
        console.error(`[sync-pending] ${order.symbol}:`, e);
      }
    }),
  );

  return { filled };
}

/** Cancel a PENDING limit order on Binance and remove it from DB. */
export async function cancelPendingOrder(id: string) {
  const order = await prisma.order.findUnique({ where: { id, status: "PENDING" } });
  if (!order) throw new Error("Order not found or not pending");
  if (order.binanceOrderId) {
    await cancelLimitOrder(order.symbol, order.binanceOrderId);
  }
  await prisma.order.delete({ where: { id } });
}
