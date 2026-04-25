import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { refreshStaleSymbols } from "@/lib/updateFunding";
import { fetchAllMarkPrices } from "@/lib/binance";
import SymbolForm from "@/components/SymbolForm";
import Dashboard from "@/components/Dashboard";
import StatsCards from "@/components/StatsCards";
import PriceHistorySync from "@/components/PriceHistorySync";
import { getSettings, PRESETS } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  await refreshStaleSymbols();
  const settings = await getSettings();
  const isMainnet = settings.binanceUrl === PRESETS.mainnet;
  const symbols = await prisma.symbol.findMany({ orderBy: { createdAt: "desc" } });
  const prices = await fetchAllMarkPrices();
  const orders = await prisma.order.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  const safeSymbols = JSON.parse(
    JSON.stringify(symbols.map((s) => ({ ...s, markPrice: prices.get(s.name) ?? null }))),
  );
  const safeOrders = JSON.parse(JSON.stringify(orders));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Binance Funding Rate Tracker
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Live funding rates + testnet trading via Binance Futures API.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium border ${isMainnet ? "border-emerald-700 bg-emerald-950/40 text-emerald-400" : "border-amber-700 bg-amber-950/40 text-amber-400"}`}>
            {isMainnet ? "Mainnet" : "Testnet"}
          </span>
          <PriceHistorySync />
          <Link href="/price-history" className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
            Price History
          </Link>
          <Link href="/funding-windows" className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
            Funding Windows
          </Link>
          <Link href="/settings" className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
            Settings
          </Link>
        </div>
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
