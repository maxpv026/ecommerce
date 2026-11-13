"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * For phone-only screens (their content is `md:hidden`): on a desktop-width
 * window, go to the desktop page that holds the same thing instead of
 * showing an empty page. Viewport, not user agent — a resized window counts.
 */
export default function DesktopRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) router.replace(to);
  }, [router, to]);
  return null;
}
