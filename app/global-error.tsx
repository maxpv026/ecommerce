"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: this catches an error thrown by the root layout
 * itself (app/[locale]/layout.tsx), which is the one failure the per-locale
 * boundary cannot catch — it lives inside that layout.
 *
 * Two constraints follow from replacing the root layout, and both are why
 * this file looks nothing like the rest of the app:
 *
 *   1. It must render its own <html> and <body>.
 *   2. Nothing the layout set up exists — no globals.css, so Tailwind classes
 *      would be inert, and no NextIntlClientProvider, so `useTranslations`
 *      would throw *inside the error boundary*. Styles are therefore inline
 *      and the copy is English only. A recognisable English page beats a
 *      second crash.
 *
 * Reaching this means the locale layout failed, which usually means messages
 * failed to load or the locale was invalid — so there is no reliable locale
 * to translate into anyway.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "(no digest)", error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: '"Helvetica Neue", Helvetica, -apple-system, "Segoe UI", sans-serif',
          // The theme class is set by a script in the layout that never ran,
          // so honour the OS preference directly instead.
          background: "#ffffff",
          color: "#0f172a",
          colorScheme: "light dark",
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #090a0c !important; color: #f8f9fa !important; }
            .hc-card { border-color: rgba(255,255,255,.08) !important; background: rgba(255,255,255,.04) !important; }
            .hc-sub { color: #94a3b8 !important; }
            .hc-ref { color: #64748b !important; }
          }
          .hc-retry:hover { background: #1d4ed8 !important; }
        `}</style>

        <div
          className="hc-card"
          style={{
            width: "100%",
            maxWidth: "480px",
            padding: "32px 24px",
            textAlign: "center",
            borderRadius: "20px",
            border: "1px solid rgba(15,23,42,.07)",
            background: "rgba(255,255,255,.7)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "23px", fontWeight: 600, letterSpacing: "-.035em" }}>
            Something went wrong
          </h1>
          <p className="hc-sub" style={{ margin: "8px auto 0", maxWidth: "38ch", fontSize: "14px", lineHeight: 1.55, color: "#64748b" }}>
            We couldn&rsquo;t load My Energy. This is usually temporary — trying again often fixes it.
          </p>

          <button
            type="button"
            onClick={() => {
              // Everything above this boundary failed, so there is no healthy
              // subtree to re-render into and no router to refresh — a full
              // document load is the only recovery that actually works here.
              reset();
              window.location.reload();
            }}
            data-error-retry
            className="hc-retry"
            style={{
              marginTop: "24px",
              minHeight: "44px",
              padding: "0 20px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#ffffff",
              background: "#2563eb",
              border: "none",
              borderRadius: "14px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {/* The digest only — never error.message, which can carry query text
              or a connection string in a non-production build. */}
          {error.digest ? (
            <p className="hc-ref" style={{ marginTop: "20px", fontSize: "11.5px", letterSpacing: ".02em", color: "#94a3b8" }}>
              Reference: <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
