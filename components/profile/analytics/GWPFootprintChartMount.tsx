"use client";

import dynamic from "next/dynamic";
import type { FootprintSlice } from "./GWPFootprintChartCanvas";

/** Same reasoning as UserSpendChartMount: ssr:false needs a client module, and recharts measures the DOM. */
const Canvas = dynamic(() => import("./GWPFootprintChartCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-6 px-5 pb-5" aria-hidden>
      <div className="h-[200px] w-[200px] flex-none animate-pulse rounded-full bg-black/[.04] dark:bg-white/[.06]" />
      <div className="flex w-full flex-col gap-2">
        {[92, 78, 64, 50].map((w) => (
          <div
            key={w}
            className="h-[12px] animate-pulse rounded bg-black/[.05] dark:bg-white/[.07]"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  ),
});

export default function GWPFootprintChartMount({
  data,
  totalTonnes,
}: {
  data: FootprintSlice[];
  totalTonnes: number;
}) {
  return <Canvas data={data} totalTonnes={totalTonnes} />;
}
