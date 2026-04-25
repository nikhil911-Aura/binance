"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Point = { price: number; recordedAt: string; phase: string };

export default function FundingWindowChart({
  data,
  fundingTime,
}: {
  data: Point[];
  fundingTime: string;
}) {
  const fundingMs = new Date(fundingTime).getTime();

  const chartData = data.map((p) => ({
    t: Math.round((new Date(p.recordedAt).getTime() - fundingMs) / 1000),
    price: p.price,
    phase: p.phase,
  }));

  const prices = data.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = Math.max((maxP - minP) * 0.1, maxP * 0.002);

  const formatPrice = (v: number) =>
    v >= 1000 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${v.toFixed(4)}`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="t"
          type="number"
          domain={[-60, 60]}
          tickCount={13}
          tickFormatter={(v) => `${v}s`}
          tick={{ fill: "#737373", fontSize: 11 }}
          axisLine={{ stroke: "#404040" }}
          tickLine={false}
        />
        <YAxis
          domain={[minP - pad, maxP + pad]}
          tickFormatter={formatPrice}
          tick={{ fill: "#737373", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip
          contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 6 }}
          labelStyle={{ color: "#a3a3a3", fontSize: 11 }}
          formatter={(value) => [formatPrice(Number(value)), "Price"]}
          labelFormatter={(t) => `${t > 0 ? "+" : ""}${t}s`}
        />
        <ReferenceLine
          x={0}
          stroke="#f59e0b"
          strokeDasharray="4 3"
          label={{ value: "Funding", fill: "#f59e0b", fontSize: 10, position: "top" }}
        />
        <Line
          type="monotone"
          dataKey="price"
          dot={false}
          strokeWidth={1.5}
          stroke="#34d399"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
