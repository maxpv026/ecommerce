"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import ErrorState from "@/components/ErrorState";

/**
 * Scoped boundary. Without it, a failure here would bubble to the locale
 * boundary and replace the entire page; with it, only this segment is
 * replaced and `reset()` re-renders just this subtree.
 */
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
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
