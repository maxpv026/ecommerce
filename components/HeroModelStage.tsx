"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three-stdlib";
import type { Group } from "three";
import CanvasErrorBoundary from "./3d/CanvasErrorBoundary";
import { FIT_SIZE, FittedModel, STUDIO_HDRI, StageLoader, configureLoader, usePrefersReducedMotion } from "./3d/ProductModelViewer";

/**
 * The home hero's cylinder: ONE canvas for the whole visit, the model
 * swapped inside it when the buyer picks another gas in the dock.
 *
 * Remounting a <ProductModelViewer> per gas (its `key={src}` design, right
 * for a product page) would tear down the WebGL context, the HDRI and the
 * orbit state on every click. Here only the mesh changes:
 *
 *   - the incoming model turns in with one smooth 360° spin (eased in
 *     useFrame; instant under prefers-reduced-motion);
 *   - while it downloads, the previous model stays on stage as the Suspense
 *     fallback — no empty frame;
 *   - once the first model is up, every dock gas is preloaded (~0.6 MB
 *     each, Draco), so later switches are instant.
 *
 * Which gas is shown is decided by the caller (components/home/HeroShowcase);
 * this file holds no randomness, so there is nothing for hydration to disagree with.
 */

const modelSrc = (mark: string) => `/${mark.toLowerCase()}.glb`;

/** Turns its children by a full revolution each time `turn` changes. */
function Spin({ turn, reduced, children }: { turn: string; reduced: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const target = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    target.current += Math.PI * 2;
  }, [turn]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const gap = target.current - g.rotation.y;
    g.rotation.y = reduced || Math.abs(gap) < 1e-3 ? target.current : g.rotation.y + gap * Math.min(1, dt * 4.2);
  });
  return <group ref={ref}>{children}</group>;
}

interface HeroModelStageProps {
  /** Catalog mark of the gas on stage, e.g. "R32". */
  mark: string;
  /** Every gas the dock offers — preloaded after the first model is up. */
  marks: readonly string[];
  className?: string;
}

export default function HeroModelStage({ mark, marks, className = "absolute inset-0" }: HeroModelStageProps) {
  const src = modelSrc(mark);
  const reduced = usePrefersReducedMotion();
  // The model actually on stage (last one that finished loading).
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = shown !== null;
  const onReady = useCallback(() => setShown(src), [src]);
  const noop = useCallback(() => undefined, []);

  // Warm the cache for the rest of the dock once something is on screen.
  const preloaded = useRef(false);
  useEffect(() => {
    if (!ready || preloaded.current) return;
    preloaded.current = true;
    const run = () => marks.forEach((m) => useLoader.preload(GLTFLoader, modelSrc(m), configureLoader));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 800);
    return () => window.clearTimeout(id);
  }, [ready, marks]);

  return (
    <div className={className} data-model-viewer data-model-src={src} data-model-shown={shown ?? ""} data-model-status={failed ? "failed" : shown === src ? "ready" : "loading"}>
      {!failed && (
        <Canvas gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} dpr={[1, 2]} camera={{ position: [0, 0.15, 5.2], fov: 32 }} className="!absolute inset-0">
          <ambientLight intensity={0.35} />
          <directionalLight position={[4, 6, 3]} intensity={0.8} />
          <directionalLight position={[-4, -1, -3]} intensity={0.2} />
          <CanvasErrorBoundary>
            <Suspense fallback={null}>
              <Environment files={STUDIO_HDRI} />
            </Suspense>
          </CanvasErrorBoundary>
          <CanvasErrorBoundary onError={() => setFailed(true)}>
            <Spin turn={src} reduced={reduced}>
              {/* While the new gas downloads, the one already on stage holds the frame. */}
              <Suspense fallback={shown && shown !== src ? <FittedModel src={shown} onReady={noop} /> : null}>
                <FittedModel key={src} src={src} onReady={onReady} />
              </Suspense>
            </Spin>
          </CanvasErrorBoundary>
          <ContactShadows position={[0, -FIT_SIZE / 2, 0]} resolution={1024} scale={10} blur={2} opacity={0.5} far={10} color="#000000" />
          <OrbitControls makeDefault enableZoom={false} enablePan={false} autoRotate={!reduced} autoRotateSpeed={1.5} minPolarAngle={Math.PI / 3.4} maxPolarAngle={Math.PI / 1.9} />
        </Canvas>
      )}
      {!ready && !failed && <StageLoader src={src} />}
    </div>
  );
}
