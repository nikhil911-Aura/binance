import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPendingOrders, checkStopLosses } from "@/lib/orderService";

export const dynamic = "force-dynamic";

export async function POST() {
  const [{ filled }, slTriggered] = await Promise.all([
    syncPendingOrders(),
    checkStopLosses(),
  ]);
  const [pendingOpen, pendingClose] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { status: "OPEN", pendingCloseOrderId: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({ filled, slTriggered, orders: pendingOpen, pendingCloses: pendingClose });
}
