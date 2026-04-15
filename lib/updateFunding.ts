import { prisma } from "./prisma";
import { fetchPremiumIndex } from "./binance";

export async function updateAllSymbols() {
  const symbols = await prisma.symbol.findMany({ select: { id: true, name: true } });
  if (symbols.length === 0) return { updated: 0, failed: 0 };

  const results = await Promise.allSettled(
    symbols.map(async (s) => {
      const data = await fetchPremiumIndex(s.name);
      if (!data) throw new Error("fetch failed");
      await prisma.symbol.update({
        where: { id: s.id },
        data: {
          fundingRate: data.fundingRate,
          nextFundingTime: data.nextFundingTime,
          fundingInterval: data.fundingInterval,
        },
      });
      return s.name;
    }),
  );

  const updated = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - updated;
  console.log(`[cron] updated=${updated} failed=${failed}`);
  return { updated, failed };
}
