import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { placeOrders } from "@/lib/orderService";

export const dynamic = "force-dynamic";

const PlaceSchema = z.object({
  symbols: z.array(z.string().trim().toUpperCase()).min(1, "Select at least one symbol"),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive("Quantity must be positive"),
  price: z.number().positive("Limit price must be positive").optional(),
});

// GET — return all orders (default: OPEN only, ?status=all for everything)
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? "OPEN";
  const where = status === "all" ? {} : { status };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(orders);
}

// POST — place market orders for selected symbols
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PlaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { symbols, side, quantity, price } = parsed.data;
  const inputs = symbols.map((symbol) => ({ symbol, side, quantity, price }));

  try {
    const results = await placeOrders(inputs);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    return NextResponse.json({ results, successCount, failCount }, { status: 201 });
  } catch (err) {
    console.error("[orders] batch place error:", err);
    return NextResponse.json(
      { error: "Failed to place orders" },
      { status: 500 },
    );
  }
}
