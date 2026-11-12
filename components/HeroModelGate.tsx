"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

/**
 * The home hero's 3D cylinder, loaded last and only where it is seen.
 *
 * The stage pulls in three.js, @react-three/fiber and drei — a ~1 MB chunk —
 * plus the model, an HDRI and the Draco decoder. It used to be imported as
 * soon as DesktopHome rendered, which had two costs, both measured:
 *
 *   - Phones downloaded the whole chunk. The desktop tree is in the DOM on
 *     every viewport (hidden with CSS below md), so the dynamic import fired
 *     for a canvas nobody could see.
 *   - On desktop, parsing it competed with hydration of the page itself.
 *
 * Now the import starts only when (1) the viewport is the desktop one, and
 * (2) the browser is idle after hydration. Until then the frame holds a
 * glow of the same size, so nothing moves when the canvas arrives; the model
 * and HDRI still load only once the canvas is on screen
 * (components/3d/ProductModelViewer).
 */

const HeroModelStage = dynamic(() => import("./HeroModelStage"), { ssr: false });

/** Matches the `md:block` that shows the desktop home. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** How long hydration may keep the main thread before the 3D starts anyway. */
const IDLE_TIMEOUT_MS = 2500;

export default function HeroModelGate({ mark, marks, className = "absolute inset-0" }: { mark: string; marks: readonly string[]; className?: string }) {
  // False on the server and during hydration, so the markup always matches.
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!isDesktop || idle) return;
    // Safari has no requestIdleCallback: a short timeout lets hydration finish first.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setIdle(true), { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setIdle(true), 300);
    return () => window.clearTimeout(id);
  }, [isDesktop, idle]);

  return (
    <>
      {/* Placeholder glow: same frame, no layout shift. The canvas is
          transparent and paints over it. */}
      <span aria-hidden data-hero-model-placeholder className={`${className} pointer-events-none grid place-items-center`}>
        <span className="h-[62%] w-[46%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,.28),rgba(99,102,241,.14)_45%,transparent_72%)] blur-2xl" />
      </span>
      {isDesktop && idle && <HeroModelStage mark={mark} marks={marks} className={className} />}
    </>
  );
}
