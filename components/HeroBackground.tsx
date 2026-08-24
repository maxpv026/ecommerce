"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";

interface HeroBackgroundProps {
  children: ReactNode;
}

/**
 * Two independent glow layers behind the Hero's content:
 * - An ambient wash that fades out as the page scrolls past the hero
 *   (tied to absolute page scroll, not this element's own position).
 * - A cursor-tracking spotlight, spring-smoothed so it trails the mouse
 *   instead of snapping to it.
 *
 * Both are sized well past the wrapper's own bounds with a soft
 * radial-gradient-to-transparent + heavy blur, so there's no hard edge
 * where the glow would otherwise get clipped.
 */
export default function HeroBackground({ children }: HeroBackgroundProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  // Ambient glow: 1 at the top of the page, fading to 0 by 300px of scroll —
  // deliberately window-scroll-based (not this element's viewport position),
  // so it reads as "fades away as you leave the hero" regardless of layout.
  const { scrollY } = useScroll();
  const ambientOpacity = useTransform(scrollY, [0, 300], [1, 0]);

  // Spotlight position: raw motion values updated on every mousemove (no
  // React re-render per pixel), run through a spring so the glow eases
  // toward the cursor with a soft trailing delay.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { stiffness: 150, damping: 20, mass: 0.6 };
  const spotlightX = useSpring(mouseX, springConfig);
  const spotlightY = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  return (
    <div
      ref={wrapperRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className="relative"
    >
      {/* Ambient + spotlight glow layers are rendered here, BEFORE
          {children}, and deliberately carry no z-index at all — negative
          z-index here lands behind an opaque compositor layer that
          framer-motion's animated ancestors (RevealSection's motion.section
          sets an inline `opacity`/`scale`, which establishes its own
          stacking context) create somewhere up the tree, making the glow
          invisible despite perfectly correct CSS. Plain DOM order is robust
          instead: earlier siblings paint behind later ones whenever every
          sibling's z-index is auto, which every element here is. */}

      {/* Ambient glow — two oversized, heavily-blurred cores (one behind the
          text column, one behind the 3D model) rather than a single blob
          centered in the gap between them, so the color actually sits under
          the content instead of peaking in the empty space between columns.
          Each is sized well past the area it needs to cover with a
          radial-gradient fading fully to transparent, so there's no hard
          edge however wide the viewport. */}
      <motion.div
        aria-hidden
        data-hero-ambient
        style={{ opacity: ambientOpacity }}
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-0 top-1/2 h-[120%] w-[70%] -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.75)_0%,rgba(37,99,235,0.35)_40%,transparent_75%)] blur-[110px]" />
        <div className="absolute right-0 top-1/2 h-[120%] w-[70%] -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.65)_0%,rgba(167,139,250,0.4)_40%,transparent_75%)] blur-[110px]" />
      </motion.div>

      {/* Mouse spotlight — soft blue/violet glow that trails the cursor. */}
      <motion.div
        aria-hidden
        data-hero-spotlight
        style={{ left: spotlightX, top: spotlightY, opacity: isHovering ? 1 : 0 }}
        className="pointer-events-none absolute h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.65)_0%,rgba(139,92,246,0.4)_45%,transparent_75%)] blur-[70px] transition-opacity duration-500 ease-out"
      />

      {children}
    </div>
  );
}
