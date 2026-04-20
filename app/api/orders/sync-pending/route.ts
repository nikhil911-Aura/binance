import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPendingOrders } from "@/lib/orderService";

export const dynamic = "force-dynamic";

export async function POST() {
  const { filled } = await syncPendingOrders();
  const pending = await prisma.order.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ filled, orders: pending });
}
