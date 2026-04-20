import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPendingOrders } from "@/lib/orderService";

export const dynamic = "force-dynamic";

export async function POST() {
  const { filled } = await syncPendingOrders();
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
  return NextResponse.json({ filled, orders: pendingOpen, pendingCloses: pendingClose });
}
