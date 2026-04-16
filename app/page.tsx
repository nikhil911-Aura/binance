import { prisma } from "@/lib/prisma";
import { refreshStaleSymbols } from "@/lib/updateFunding";
import SymbolForm from "@/components/SymbolForm";
import Dashboard from "@/components/Dashboard";
import StatsCards from "@/components/StatsCards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  await refreshStaleSymbols();
  const symbols = await prisma.symbol.findMany({ orderBy: { createdAt: "desc" } });
  const orders = await prisma.order.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  const safeSymbols = JSON.parse(JSON.stringify(symbols));
  const safeOrders = JSON.parse(JSON.stringify(orders));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Binance Funding Rate Tracker
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Live funding rates + testnet trading via Binance Futures API.
        </p>
      </header>

      <section className="mb-5">
        <StatsCards rows={safeSymbols} />
      </section>

      <section className="mb-5">
        <SymbolForm />
      </section>

      <Dashboard initialSymbols={safeSymbols} initialOrders={safeOrders} />
    </main>
  );
}
