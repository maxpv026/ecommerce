"use client";

import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Image from "next/image";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { DRACOLoader, GLTFLoader, MeshoptDecoder } from "three-stdlib";
import { Box3, Vector3 } from "three";
import CanvasErrorBoundary from "./CanvasErrorBoundary";
import { modelPathForProduct } from "@/lib/productMedia";
import { clearModelProgress, reportModelProgress, useModelProgress } from "./modelProgress";

/**
 * The premium PDP model stage.
 *
 * Three things make this more than a `<Canvas>` with a `useGLTF` in it:
 *
 *  1. It never hard-fails. A product with no model (equipment, services) and
 *     a product whose .glb 404s both land on the same poster, because a
 *     throw inside the R3F tree would otherwise take the whole canvas — and
 *     with it the product page — down.
 *  2. It auto-fits whatever it is given. The models come out of Meshy at
 *     arbitrary scale and origin, so the framing is derived from the loaded
 *     bounding box instead of being hand-tuned per file.
 *  3. It doesn't boot WebGL until the stage is near the viewport, and it
 *     shows real load progress while it fetches — which matters a lot here,
 *     because these models are 22–95 MB each.
 */

/** Longest axis of the fitted model, in world units. The camera frames this. */
const FIT_SIZE = 2.2;

/**
 * Studio HDRI, self-hosted.
 *
 * `<Environment preset="studio" />` would pull this exact file from
 * raw.githack.com on every page view — a third-party request per visitor,
 * rate-limited and outside our control. Same asset (Poly Haven, CC0),
 * served from our own origin.
 */
const STUDIO_HDRI = "/hdri/studio_small_03_1k.hdr";

/**
 * Draco decoder, self-hosted for the same reason as the HDRI — drei's
 * default points at gstatic.com. Nothing in `public/` is Draco-compressed
 * today, and the decoder is only fetched when a compressed mesh is actually
 * encountered, so this costs nothing until these models get compressed.
 * Meshopt needs no download: three-stdlib bundles the decoder.
 */
const DRACO_DECODER_PATH = "/draco/";

let dracoLoader: DRACOLoader | null = null;

function configureLoader(loader: GLTFLoader) {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  }
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(typeof MeshoptDecoder === "function" ? MeshoptDecoder() : MeshoptDecoder);
}

/* ────────────────────────────────────────────────────────────────────────
   Scene
   ──────────────────────────────────────────────────────────────────────── */

interface FittedModelProps {
  src: string;
  onReady: () => void;
}

function FittedModel({ src, onReady }: FittedModelProps) {
  const handleProgress = useCallback(
    (event: ProgressEvent<EventTarget>) => {
      if (event.lengthComputable) reportModelProgress(src, event.loaded, event.total);
    },
    [src]
  );

  // `useLoader` rather than drei's `useGLTF` purely for this fourth argument:
  // it's the only way to get byte-level progress out of the fetch. The
  // suspense cache is keyed on (loader, url) alone, so this still shares one
  // cached model with any `useGLTF(src)` elsewhere in the app.
  const { scene } = useLoader(GLTFLoader, src, configureLoader, handleProgress);

  const { object, offset, scale } = useMemo(() => {
    // useGLTF hands every caller the *same* scene object, and an Object3D can
    // only have one parent — clone so two viewers of one model can coexist.
    // Geometry and material buffers stay shared; only the nodes duplicate.
    const object = scene.clone(true);
    object.updateWorldMatrix(true, true);

    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const longest = Math.max(size.x, size.y, size.z);

    return {
      object,
      offset: center.negate(),
      scale: longest > 0 ? FIT_SIZE / longest : 1,
    };
  }, [scene]);

  const invalidate = useThree((state) => state.invalidate);

  // Runs once the suspense has resolved, which is the stage's cue to drop the
  // loading overlay and show the orbit hint.
  useEffect(() => {
    onReady();

    // In grid mode the canvas is frameloop="demand": it draws once and stops.
    // The model lands after that first frame and the HDRI that lights it
    // later still, and applying an environment map isn't a scene-graph
    // mutation R3F would notice — so ask for a handful of frames on the way
    // in. A no-op on the PDP, which renders continuously anyway.
    const timers = [0, 60, 160, 320, 640, 1200].map((delay) =>
      window.setTimeout(() => invalidate(), delay)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [onReady, invalidate]);

  return (
    // A slight lean off vertical reads as a deliberately posed studio shot
    // rather than a perfectly upright render.
    <group scale={scale} rotation={[0, 0.4, -0.2]}>
      <primitive object={object} position={offset} />
    </group>
  );
}

/** Sleek loading state: a progress ring over the stage's own backdrop. */
function StageLoader({ src }: { src: string }) {
  // Isolated in its own component so progress ticks re-render the ring and
  // nothing else — in particular, not the Canvas.
  const { loaded, total } = useModelProgress(src);
  // No size to divide by (a chunked response with neither X-File-Size nor
  // Content-Length) means no honest number to show — the ring spins alone.
  const pct = total > 0 ? Math.min(99, Math.floor((loaded / total) * 100)) : null;

  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      data-model-loader
      data-model-progress={pct ?? ""}
      role="status"
      aria-live="polite"
    >
      <span
        className="relative grid h-[52px] w-[52px] place-items-center"
      >
        <span className="absolute inset-0 rounded-full border-2 border-slate-900/10 dark:border-white/10" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan-500/90 [animation-duration:900ms] dark:border-t-cyan-300/90" />
        {pct !== null && (
          <span className="text-[10.5px] font-semibold tabular-nums text-white/70">{pct}%</span>
        )}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Reduced motion
   ──────────────────────────────────────────────────────────────────────── */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A model that spins on its own is exactly the continuous motion
 * `prefers-reduced-motion` exists for. Read as an external store rather than
 * effect-then-setState, so there's no spin-then-stop flash on first paint.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Stage
   ──────────────────────────────────────────────────────────────────────── */

interface ModelStageProps {
  src: string;
  poster: ReactNode;
  badgeLabel?: string;
  className: string;
  onFail: () => void;
}

/**
 * Mounted under `key={src}`, so switching products resets load state by
 * remounting rather than by reaching back in with an effect.
 */
function ModelStage({ src, poster, badgeLabel, className, onFail }: ModelStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  // Deferred until the stage is near the viewport: no WebGL context and, more
  // importantly, no multi-megabyte fetch for a stage the user never reaches.
  const [inView, setInView] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const handleError = useCallback(() => {
    setFailed(true);
    onFail();
  }, [onFail]);
  const handleReady = useCallback(() => {
    clearModelProgress(src);
    setReady(true);
  }, [src]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // One-way latch: a product page has exactly one stage, so once it has
        // been seen, keep it mounted rather than re-uploading to the GPU when
        // the user scrolls back up.
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // Start fetching a little before it scrolls into view.
      { rootMargin: "300px" }
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      // A thumbnail is decoration inside the card's link: it must not absorb
      // the click, and nothing inside it is interactive.
      className={className}
      data-model-viewer
      data-model-mode={failed ? "poster" : "model"}
      data-model-src={src}
      data-model-status={failed ? "failed" : ready ? "ready" : "loading"}
      data-model-mounted={inView ? "true" : "false"}
    >
      {/* The poster is the floor, not just the failure case: it holds the
          tile whenever no canvas is up — off-screen, waiting for a pool
          slot, still downloading, or failed — so a card is never an empty
          box and the grid layout never shifts. The canvas paints over it
          (transparently) and it is dropped only once the model is actually
          rendering. */}
      {(failed || !ready || !inView) && (
        <span className="absolute inset-0 block" data-model-poster>
          {poster}
        </span>
      )}

      {!failed && (
        <>
          {inView && (
            <Canvas
              // Transparent, so the stage's own gradients and grid show
              // through behind the cylinder.
              gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
              dpr={[1, 2]}
              camera={{ position: [0, 0.15, 5.2], fov: 32 }}
              // Grid thumbnails sit inside the card's <Link>: the canvas must
              // not swallow the click that navigates to the product.
              className="!absolute inset-0"
            >
              {/* Kept modest: these carry the model on their own if the HDRI
                  fails, and sit under it when it doesn't. */}
              <ambientLight intensity={0.35} />
              <directionalLight position={[4, 6, 3]} intensity={0.8} />
              <directionalLight position={[-4, -1, -3]} intensity={0.2} />

              {/* Its own boundary: a missing HDRI should cost us reflections,
                  not the whole viewer. */}
              <CanvasErrorBoundary>
                <Suspense fallback={null}>
                  <Environment files={STUDIO_HDRI} />
                </Suspense>
              </CanvasErrorBoundary>

              <CanvasErrorBoundary onError={handleError}>
                {/* The visible loading state is DOM (see StageLoader) rather
                    than a 3D suspense fallback: it can render before the
                    WebGL context exists, and it can show real byte progress. */}
                <Suspense fallback={null}>
                  <FittedModel src={src} onReady={handleReady} />
                </Suspense>
              </CanvasErrorBoundary>

              {/* Grounds the model. Sits at the fitted model's base: a
                  cylinder's longest axis is its height, so after the fit the
                  base lands exactly at -FIT_SIZE / 2. */}
              <ContactShadows
                position={[0, -FIT_SIZE / 2, 0]}
                resolution={1024}
                scale={10}
                blur={2}
                opacity={0.5}
                far={10}
                color="#000000"
              />

              <OrbitControls
                makeDefault
                enableZoom={false}
                enablePan={false}
                autoRotate={!reducedMotion}
                autoRotateSpeed={1.5}
                // Free turntable, but clamped off the poles so the cylinder
                // can never be dragged onto its head or viewed from directly
                // underneath.
                minPolarAngle={Math.PI / 3.4}
                maxPolarAngle={Math.PI / 1.9}
              />
            </Canvas>
          )}

          {!ready && inView && <StageLoader src={src} />}

          {ready && badgeLabel && (
            <span
              data-model-badge
              className="pointer-events-none absolute bottom-[18px] left-5 inline-flex items-center gap-[7px] rounded-full border border-white/[.16] bg-white/[.08] py-1.5 pl-[9px] pr-3 text-[10.5px] font-semibold text-white/[.86] backdrop-blur-sm"
            >
              <span className="h-[5px] w-[5px] rounded-full bg-cyan-300 shadow-[0_0_8px_1px_#67e8f9]" />
              {badgeLabel}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Viewer
   ──────────────────────────────────────────────────────────────────────── */

export interface ProductModelViewerProps {
  /** Product SKU, e.g. "HC-R410A-25" — the primary resolution signal. */
  sku: string;
  /**
   * Product name, e.g. "R-410A Premium". Optional: a few SKUs drop the R
   * ("HC-410A-50") and are only identifiable from the name, so pass it when
   * you have it.
   */
  name?: string;
  /**
   * Explicit model path, bypassing mark resolution. `null` forces the
   * poster; omit it entirely to resolve from name/sku.
   */
  modelPath?: string | null;
  /** Rendered instead of the canvas when there's no model, or it fails. */
  poster?: ReactNode;
  /** Static product photography for the poster, if we ever ship any. */
  posterSrc?: string;
  posterAlt?: string;
  /** "3D · drag to orbit". Passed in so the caller owns the translation. */
  badgeLabel?: string;
  className?: string;
  /** Notified when a resolved model turns out not to be loadable. */
  onFallback?: () => void;
}

function ProductModelViewer({
  sku,
  name = "",
  modelPath,
  poster = null,
  posterSrc,
  posterAlt,
  badgeLabel,
  className = "absolute inset-0",
  onFallback,
}: ProductModelViewerProps) {
  // `undefined` means "resolve it"; an explicit `null` means "no model".
  const src = useMemo(
    () => (modelPath !== undefined ? modelPath : modelPathForProduct({ name, sku })),
    [modelPath, name, sku]
  );

  const handleFail = useCallback(() => onFallback?.(), [onFallback]);

  const fallback = posterSrc ? (
    <span className="absolute inset-0 block">
      <Image
        src={posterSrc}
        alt={posterAlt || sku}
        fill
        sizes="(max-width: 1024px) 100vw, 55vw"
        className="object-contain"
      />
    </span>
  ) : (
    poster
  );

  // No model for this product at all — equipment, services, anything that
  // isn't a cylinder. Nothing 3D is mounted and nothing is fetched.
  if (!src) {
    return (
      <div
        className={className}
        data-model-viewer
        data-model-mode="poster"
        data-model-status="poster"
        >
        <span className="absolute inset-0 block" data-model-poster>
          {fallback}
        </span>
      </div>
    );
  }

  return (
    <ModelStage
      key={src}
      src={src}
      poster={fallback}
      badgeLabel={badgeLabel}
      className={className}
      onFail={handleFail}
    />
  );
}

/**
 * Memoised deliberately.
 *
 * In `frameloop="demand"` a React re-render of the Canvas re-commits the
 * scene, and R3F invalidates on every commit — so a parent that re-renders
 * on hover (which the product cards do) would quietly redraw the whole grid
 * on mouse-move. Callers keep `poster` referentially stable (hoist it out of
 * the render) and this memo does the rest.
 */
export default memo(ProductModelViewer);
