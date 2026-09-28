"use client";

import dynamic from "next/dynamic";
import type { SpendPoint } from "./UserSpendChartCanvas";

/**
 * Loads the canvas in the browser only.
 *
 * This wrapper exists rather than a `dynamic()` in the server component for
 * two reasons:
 *
 *   1. `next/dynamic` with `ssr: false` is not allowed in a Server Component
 *      in Next 16 — it has to be called from a client module.
 *   2. recharts sizes itself by measuring the DOM. Server-rendered it emits a
 *      zero-width chart that jumps to its real size on hydration: both a
 *      layout shift and a hydration mismatch.
 *
 * The skeleton is passed as `loading` so the panel holds its exact height
 * while the bundle arrives and nothing below it moves.
 */
const Canvas = dynamic(() => import("./UserSpendChartCanvas"), {
  ssr: false,
  loading: () => (
    <div className="h-[240px] w-full animate-pulse px-5 pb-4 pt-4" aria-hidden>
      <div className="h-full w-full rounded-[12px] bg-black/[.04] dark:bg-white/[.06]" />
    </div>
  ),
});

export default function UserSpendChartMount({ data }: { data: SpendPoint[] }) {
  return <Canvas data={data} />;
}
