"use client";

import { useState } from "react";
import { GAS_MARKS } from "@/lib/gasMarks";
import ProductModelViewer from "./3d/ProductModelViewer";

/**
 * The home hero's cylinder — a different refrigerant on every visit.
 *
 * The randomisation has to be browser-only: picking during the server render
 * would bake one choice into the HTML and then disagree with whatever the
 * client picked on hydration. The usual fix is a default in `useState` plus a
 * `useEffect` that swaps it after mount, but this codebase runs the React
 * Compiler's `set-state-in-effect` rule, which rejects a synchronous setState
 * in an effect body (it costs a second render pass for no reason here).
 *
 * So this component is mounted through `dynamic(..., { ssr: false })` and
 * never renders on the server at all. That makes a lazy `useState`
 * initialiser completely safe — it only ever runs in the browser, there is no
 * server output to disagree with, and there is no effect and no second
 * render. It also re-rolls on client-side navigation back to the home page,
 * not just on a hard reload.
 *
 * Every mark in GAS_MARKS ships a model today; if one ever doesn't, the
 * viewer falls back to its poster rather than showing an empty stage.
 */

const pickRefrigerant = () => GAS_MARKS[Math.floor(Math.random() * GAS_MARKS.length)];

interface HeroModelStageProps {
  className?: string;
}

export default function HeroModelStage({ className = "absolute inset-0" }: HeroModelStageProps) {
  // Lazy initialiser: evaluated once per mount, in the browser only.
  const [mark] = useState(pickRefrigerant);

  // The viewer publishes the resolved file as `data-model-src`, so there's no
  // need to surface the mark separately.
  return <ProductModelViewer sku={mark} className={className} />;
}
