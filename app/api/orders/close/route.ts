import { NextResponse } from "next/server";
import { z } from "zod";
import { closeOrders } from "@/lib/orderService";

export const dynamic = "force-dynamic";

const CloseSchema = z.object({
  orders: z
    .array(
      z.object({
        id: z.string().uuid(),
        quantity: z.number().positive().optional(),
        price: z.number().positive().optional(),
      }),
    )
    .min(1, "Select at least one order"),
});

// POST — close selected orders (place opposite market orders)
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CloseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const results = await closeOrders(parsed.data.orders);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    return NextResponse.json({ results, successCount, failCount });
  } catch (err) {
    console.error("[orders] batch close error:", err);
    return NextResponse.json({ error: "Failed to close orders" }, { status: 500 });
  }
}
