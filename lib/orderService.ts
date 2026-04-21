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
  inputs: { id: string; quantity?: number; price?: number }[],
): Promise<PlaceResult[]> {
  const ids = inputs.map((i) => i.id);
  const qtyOverride = new Map(inputs.map((i) => [i.id, i.quantity]));
  const priceOverride = new Map(inputs.map((i) => [i.id, i.price]));

  const orders = await prisma.order.findMany({
    where: { id: { in: ids }, status: "OPEN" },
  });

  if (orders.length === 0) return [];

  const results = await Promise.allSettled(
    orders.map(async (order): Promise<PlaceResult> => {
      const closeQty = qtyOverride.get(order.id) ?? order.quantity;
      const closePrice = priceOverride.get(order.id);

      const res = await closePosition(
        order.symbol,
        order.side as "BUY" | "SELL",
        closeQty,
        closePrice,
      );

      const isPartial = closeQty < order.quantity;

      // Limit close — order is pending on exchange, don't mark CLOSED yet
      if (closePrice != null) {
        if (isPartial) {
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
              binanceOrderId: order.binanceOrderId,
              pendingCloseOrderId: String(res.orderId),
              pendingClosePrice: closePrice,
              status: "OPEN",
            },
          });
        } else {
          await prisma.order.update({
            where: { id: order.id },
            data: { pendingCloseOrderId: String(res.orderId), pendingClosePrice: closePrice },
          });
        }
        return { symbol: order.symbol, success: true, orderId: order.id };
      }

      // Market close — fills immediately, mark CLOSED now
      let exitPrice = parseFloat(res.avgPrice) || 0;
      if (exitPrice === 0) {
        try {
          exitPrice = await getMarkPrice(order.symbol);
        } catch {
          exitPrice = 0;
        }
      }

      let profit: number | null = null;
      if (exitPrice > 0 && order.entryPrice != null && order.entryPrice > 0) {
        profit =
          order.side === "BUY"
            ? (exitPrice - order.entryPrice) * closeQty
            : (order.entryPrice - exitPrice) * closeQty;
      }

      if (isPartial) {
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

/** Check all PENDING limit orders + pending limit closes against Binance. */
export async function syncPendingOrders() {
  let filled = 0;

  // 1. Pending limit buy/sell orders (status = PENDING)
  const pending = await prisma.order.findMany({ where: { status: "PENDING" } });
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

  // 2. Pending limit close orders (status = OPEN but pendingCloseOrderId set)
  const pendingCloses = await prisma.order.findMany({
    where: { status: "OPEN", pendingCloseOrderId: { not: null } },
  });
  await Promise.allSettled(
    pendingCloses.map(async (order) => {
      if (!order.pendingCloseOrderId) return;
      try {
        const info = await getOrderStatus(order.symbol, order.pendingCloseOrderId);
        if (info.status === "FILLED") {
          const exitPrice = parseFloat(info.avgPrice) || 0;
          let profit: number | null = null;
          if (exitPrice > 0 && order.entryPrice != null && order.entryPrice > 0) {
            profit = order.side === "BUY"
              ? (exitPrice - order.entryPrice) * order.quantity
              : (order.entryPrice - exitPrice) * order.quantity;
          }
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "CLOSED", exitPrice, profit, pendingCloseOrderId: null },
          });
          filled++;
        } else if (info.status === "CANCELED" || info.status === "EXPIRED") {
          // Close order cancelled — restore position to normal open
          await prisma.order.update({
            where: { id: order.id },
            data: { pendingCloseOrderId: null },
          });
        }
      } catch (e) {
        console.error(`[sync-pending-close] ${order.symbol}:`, e);
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

/** Check all OPEN orders with a stopLoss set and market-close any that have been triggered. */
export async function checkStopLosses(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { status: "OPEN", stopLoss: { not: null }, pendingCloseOrderId: null },
  });
  if (orders.length === 0) return 0;

  // Fetch mark prices for all unique symbols in one pass
  const symbols = [...new Set(orders.map((o) => o.symbol))];
  const prices = new Map<string, number>();
  await Promise.allSettled(
    symbols.map(async (sym) => {
      try {
        prices.set(sym, await getMarkPrice(sym));
      } catch { /* skip */ }
    }),
  );

  let triggered = 0;
  await Promise.allSettled(
    orders.map(async (order) => {
      const markPrice = prices.get(order.symbol);
      if (markPrice == null || order.stopLoss == null) return;

      const isLong = order.side === "BUY";
      const slHit = isLong
        ? markPrice <= order.stopLoss   // long: SL hit when price drops to/below SL
        : markPrice >= order.stopLoss;  // short: SL hit when price rises to/above SL

      if (!slHit) return;

      try {
        const res = await closePosition(order.symbol, order.side as "BUY" | "SELL", order.quantity);
        const exitPrice = parseFloat(res.avgPrice) || markPrice;
        const profit = order.entryPrice != null
          ? (isLong ? exitPrice - order.entryPrice : order.entryPrice - exitPrice) * order.quantity
          : null;
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CLOSED", exitPrice, profit, stopLoss: null },
        });
        triggered++;
        console.log(`[stop-loss] ${order.symbol} SL triggered @ ${markPrice} (SL: ${order.stopLoss})`);
      } catch (e) {
        console.error(`[stop-loss] ${order.symbol} close failed:`, e);
      }
    }),
  );

  return triggered;
}

/** Cancel a pending limit close on Binance and clear the pendingCloseOrderId on the OPEN order. */
export async function cancelPendingClose(id: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || !order.pendingCloseOrderId) throw new Error("No pending close found for this order");
  await cancelLimitOrder(order.symbol, order.pendingCloseOrderId);
  await prisma.order.update({
    where: { id },
    data: { pendingCloseOrderId: null, pendingClosePrice: null },
  });
}
