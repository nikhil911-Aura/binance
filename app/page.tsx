import { prisma } from "@/lib/prisma";
import SymbolForm from "@/components/SymbolForm";
import SymbolTable from "@/components/SymbolTable";
import StatsCards from "@/components/StatsCards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const symbols = await prisma.symbol.findMany({ orderBy: { createdAt: "desc" } });
  const safe = JSON.parse(JSON.stringify(symbols));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Binance Funding Rate Tracker
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Live funding rates updated every minute via Binance Futures API.
        </p>
      </header>

      <section className="mb-6">
        <StatsCards rows={safe} />
      </section>

      <section className="mb-8">
        <SymbolForm />
      </section>

      <section>
        <SymbolTable initial={safe} />
      </section>
    </main>
  );
}
