import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { routing } from "./i18n/routing";
import { securityHeaders } from "./lib/securityHeaders";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Publishes each 3D model's byte size as `X-File-Size`.
 *
 * Next gzips static responses, which replaces Content-Length with a chunked
 * transfer — so three's GLTFLoader reports `lengthComputable: false` and the
 * product page's loading ring has no percentage to show. On 22–95 MB models
 * that matters. three checks `X-File-Size` before Content-Length for exactly
 * this situation, so hand it the real size.
 */
function modelSizeHeaders() {
  const dir = path.join(process.cwd(), "public");

  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".glb"));
  } catch {
    return [];
  }

  return files.map((file) => ({
    source: `/${file}`,
    headers: [{ key: "X-File-Size", value: String(statSync(path.join(dir, file)).size) }],
  }));
}

// Every locale, as an alternation for the redirect's path pattern:
// "bg|hr|cs|…". Built from routing.locales so adding a locale can never
// leave its /cylinders bookmarks behind.
const LOCALE_PATTERN = routing.locales.join("|");

const nextConfig: NextConfig = {
  // public/ is served from the CDN and is not part of a serverless function's
  // filesystem by default. lib/pdf.ts reads these TTFs at runtime with fs, and
  // Next's tracer cannot see through `join(process.cwd(), ...)` to find them —
  // so without this the invoice silently falls back to Latin-1 Helvetica in
  // production while working perfectly in local dev.
  outputFileTracingIncludes: {
    "/api/invoices/**": ["./public/fonts/**"],
    "/**": ["./public/fonts/**"],
  },

  async headers() {
    return [
      // Security headers on every response, including the API routes and
      // the 404 — a header that only covers pages leaves the holes that
      // matter. Listed first so a later, narrower rule cannot drop them.
      { source: "/:path*", headers: securityHeaders() },
      // Per-file Content-Length hints for the .glb models (see below).
      ...modelSizeHeaders(),
    ];
  },

  async redirects() {
    return [
      // /cylinders was consolidated into /products. Permanent (308) so search
      // engines drop the old URL and browsers stop re-requesting it — and so
      // the method is preserved, unlike a 301.
      //
      // Two entries because locale routing puts the prefix first: a bookmark
      // is "/en/cylinders", while a hand-typed or legacy link is "/cylinders".
      // The `:path*` suffix catches anything that was ever nested under it.
      {
        source: `/:locale(${LOCALE_PATTERN})/cylinders/:path*`,
        destination: "/:locale/products/:path*",
        permanent: true,
      },
      {
        source: "/cylinders/:path*",
        destination: "/products/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
