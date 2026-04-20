import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.scheduledOrder.delete({ where: { id: params.id } });
  } catch {
    // Ignore if record not found
  }
  return NextResponse.json({ ok: true });
}
