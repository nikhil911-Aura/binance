import { prisma } from "./prisma";
import { placeMarketOrder, closePosition } from "./binanceTestnet";

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
      const res = await placeMarketOrder(symbol, side, quantity);
      const avgPrice = parseFloat(res.avgPrice) || null;

      const order = await prisma.order.create({
        data: {
          symbol,
          side,
          quantity,
          entryPrice: avgPrice,
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
      const exitPrice = parseFloat(res.avgPrice) || null;

      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CLOSED", exitPrice },
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
