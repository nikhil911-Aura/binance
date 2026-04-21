import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { id, stopLoss } = await req.json() as { id: string; stopLoss: number | null };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.status !== "OPEN") {
    return NextResponse.json({ error: "Order not found or not open" }, { status: 404 });
  }

  await prisma.order.update({
    where: { id },
    data: { stopLoss: stopLoss ?? null },
  });

  return NextResponse.json({ ok: true });
}
