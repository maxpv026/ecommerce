"use client";

import dynamic from "next/dynamic";
import type { RevenuePoint } from "./RevenueChartCanvas";

/**
 * Loads the chart canvas in the browser only.
 *
 * Two reasons this wrapper exists rather than a `dynamic()` in the server
 * component above:
 *
 *   1. `next/dynamic` with `ssr: false` is not allowed in a Server Component
 *      in Next 16 — it has to be called from a client module.
 *   2. recharts sizes itself by measuring the DOM. Server-rendered it emits a
 *      zero-width chart that jumps to its real size on hydration, which is
 *      both a layout shift and a hydration mismatch.
 *
 * The skeleton is passed as `loading` so the panel keeps its exact height
 * while the bundle arrives — nothing below it moves.
 */
const Canvas = dynamic(() => import("./RevenueChartCanvas"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] w-full animate-pulse px-6 pb-6 pt-8" aria-hidden>
      <div className="h-full w-full rounded-[12px] bg-black/[.04] dark:bg-white/[.06]" />
    </div>
  ),
});

export default function RevenueChartMount({ data }: { data: RevenuePoint[] }) {
  return <Canvas data={data} />;
}
