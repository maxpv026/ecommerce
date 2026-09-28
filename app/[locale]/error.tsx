"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import ErrorState from "@/components/ErrorState";

/**
 * The catch-all boundary for every route under a locale.
 *
 * It exists because of streaming. Once a segment has a `loading.tsx`, the
 * shell is flushed before the data resolves — which means the HTTP status is
 * already 200 by the time anything can fail. A server error after that point
 * cannot change the status code; without a boundary the buyer gets a blank or
 * half-drawn page and monitoring sees a healthy 200. This turns that into a
 * visible, recoverable state.
 *
 * It sits *inside* the locale layout, so the next-intl provider is mounted and
 * this can be translated. An error thrown by the layout itself escapes to
 * app/global-error.tsx, which cannot be.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the handle support needs to find the real error in the
    // server log; the message is already redacted by Next in production.
    console.error("[error-boundary]", error.digest ?? "(no digest)", error.message);
  }, [error]);

  const t = useTranslations("ErrorBoundary");

  return (
    <ErrorState
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      homeLabel={t("home")}
      referenceLabel={t("reference")}
      digest={error.digest}
      reset={reset}
    />
  );
}
