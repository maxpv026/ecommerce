"use client";

import { Toaster } from "sonner";

// Global toast host. Unstyled sonner + Tailwind classes so toasts follow the
// app's glass aesthetic and the `.dark` class (sonner's own `theme` prop only
// understands prefers-color-scheme, not our class-based toggle).
export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      offset={24}
      gap={10}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[356px] items-center gap-3 rounded-[16px] border border-white/75 bg-white/85 px-4 py-3.5 text-[13.5px] font-medium tracking-[-.01em] text-slate-900 shadow-[0_24px_56px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-surface/95 dark:text-slate-50 dark:shadow-[0_24px_56px_-20px_rgba(0,0,0,0.7)]",
          title: "leading-[1.45]",
          description: "text-[12.5px] font-normal text-slate-500 dark:text-ink-muted",
          icon: "flex-none [&_svg]:h-[17px] [&_svg]:w-[17px]",
          success: "[&_svg]:text-green-600 dark:[&_svg]:text-green-400",
          error: "[&_svg]:text-red-600 dark:[&_svg]:text-red-400",
          info: "[&_svg]:text-blue-700 dark:[&_svg]:text-blue-400",
        },
      }}
    />
  );
}
