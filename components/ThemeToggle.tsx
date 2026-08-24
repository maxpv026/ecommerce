"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "halocore-theme";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

const DEFAULT_CLASSNAME =
  "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-slate-900/[.12] bg-white text-slate-600 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/30";

interface ThemeToggleProps {
  className?: string;
  iconSize?: number;
}

export default function ThemeToggle({ className, iconSize = 15 }: ThemeToggleProps) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Dev-only safety net: React Strict Mode's mount/unmount/remount cycle
  // resets <html> to only the attributes it manages from JSX, clearing the
  // "dark" class the layout's inline pre-hydration script set. Re-apply it
  // here so dev matches production, which never remounts and never needs
  // this. See next/dist/docs/.../preventing-flash-before-hydration.md.
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "dark") {
        document.documentElement.classList.add("dark");
      }
    } catch {
      // localStorage unavailable — the inline script's own try/catch
      // already handled this identically, nothing more to do.
    }
  }, []);

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={className ?? DEFAULT_CLASSNAME}
    >
      {isDark ? <Sun size={iconSize} strokeWidth={2} /> : <Moon size={iconSize} strokeWidth={2} />}
    </button>
  );
}
