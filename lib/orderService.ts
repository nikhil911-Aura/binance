import { prisma } from "./prisma";
import { placeMarketOrder, closePosition, isTestnetSymbol, getMarkPrice } from "./binanceTestnet";

export type PlaceOrderInput = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
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
    inputs.map(async ({ symbol, side, quantity }): Promise<PlaceResult> => {
      // Pre-validate: check if symbol exists on testnet
      const valid = await isTestnetSymbol(symbol);
      if (!valid) {
        throw new Error(`${symbol} is not available on the Binance testnet`);
      }

      const res = await placeMarketOrder(symbol, side, quantity);

      // avgPrice can be "0" for instant fills — fall back to mark price
      let entryPrice = parseFloat(res.avgPrice) || 0;
      if (entryPrice === 0) {
        try {
          entryPrice = await getMarkPrice(symbol);
        } catch {
          entryPrice = 0;
        }
      }

      const order = await prisma.order.create({
        data: {
          symbol,
          side,
          quantity,
          entryPrice: entryPrice > 0 ? entryPrice : null,
          binanceOrderId: String(res.orderId),
          status: "OPEN",
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

/** Close orders by IDs: place opposite market orders and mark CLOSED. */
export async function closeOrders(orderIds: string[]): Promise<PlaceResult[]> {
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, status: "OPEN" },
  });

  if (orders.length === 0) return [];

  const results = await Promise.allSettled(
    orders.map(async (order): Promise<PlaceResult> => {
      const res = await closePosition(
        order.symbol,
        order.side as "BUY" | "SELL",
        order.quantity,
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

      // Calculate profit if we have both prices
      let profit: number | null = null;
      if (exitPrice > 0 && order.entryPrice != null && order.entryPrice > 0) {
        profit =
          order.side === "BUY"
            ? (exitPrice - order.entryPrice) * order.quantity
            : (order.entryPrice - exitPrice) * order.quantity;
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "CLOSED",
          exitPrice: exitPrice > 0 ? exitPrice : null,
          profit,
        },
      });

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
