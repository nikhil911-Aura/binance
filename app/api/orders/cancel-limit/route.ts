import { NextResponse } from "next/server";
import { cancelPendingOrder, cancelPendingClose } from "@/lib/orderService";

export async function POST(req: Request) {
  const { id, type } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    if (type === "close") {
      await cancelPendingClose(id);
    } else {
      await cancelPendingOrder(id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
