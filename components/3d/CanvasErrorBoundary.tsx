"use client";

import { Component, type ReactNode } from "react";

interface CanvasErrorBoundaryProps {
  /** Called once, when the subtree throws. */
  onError?: () => void;
  children: ReactNode;
}

/**
 * Catches the throw from a missing or corrupt 3D asset.
 *
 * `useGLTF` (and `useEnvironment`) suspend and then throw synchronously when
 * the fetch fails, so a boundary is the only thing standing between a
 * deleted .glb and a blank product page.
 *
 * It has to live *inside* the `<Canvas>` — react-three-fiber renders its
 * children through its own reconciler, so a boundary in the surrounding DOM
 * tree never sees these errors. It renders nothing on failure; any DOM-side
 * recovery (swapping in a poster) is the caller's job, via `onError`.
 */
export default class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[3d] asset failed to load:", error);
    }
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
