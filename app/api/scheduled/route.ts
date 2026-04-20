import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.scheduledOrder.findMany({
    orderBy: { executeAt: "asc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, label, executeAt, type, params } = body as {
    id: string;
    label: string;
    executeAt: number;
    type: string;
    params: Record<string, unknown>;
  };
  const task = await prisma.scheduledOrder.create({
    data: { id, label, executeAt: new Date(executeAt), type, params: params as Prisma.InputJsonValue },
  });
  return NextResponse.json(task);
}
