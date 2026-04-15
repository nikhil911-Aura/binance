import { PrismaClient } from "@prisma/client";

// Lazy singleton — PrismaClient is only constructed on first property access.
// This prevents Next.js build-time module evaluation from triggering Prisma
// initialization (which would throw if DATABASE_URL is unavailable at build).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ log: ["error", "warn"] });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
