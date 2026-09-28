/**
 * The application's HTTP security headers.
 *
 * Kept out of next.config.ts so the values are importable and testable
 * rather than buried in build config.
 */

/**
 * Why script-src still allows 'unsafe-inline'. This was measured, not assumed.
 *
 * Every page this app serves carries three inline <script> tags: our theme
 * flash-guard, and two of Next's React Server Component payload pushes
 * (`self.__next_f.push([1, "...page data..."])`). Those two carry the page's
 * own serialised data, so they differ per page and per build — they cannot be
 * pinned by a hash in a static header, and Subresource Integrity does not
 * apply to inline scripts at all.
 *
 * That leaves exactly two options:
 *
 *   1. 'unsafe-inline' — what we do. This is also the configuration Next's
 *      own "Without Nonces" guide documents.
 *   2. A per-request nonce, which Next attaches to its own scripts
 *      automatically. Genuinely strict, but per Next's CSP guide it forces
 *      EVERY page into dynamic rendering: no static generation, no ISR, no
 *      CDN caching. This build prerenders 1053 pages, so that is a serious
 *      cost, and it is the user's call to make, not a silent default.
 *
 * A first attempt added a SHA-256 of the theme script alongside
 * 'unsafe-inline'. Do not do that: when a hash or nonce is present, browsers
 * IGNORE 'unsafe-inline' entirely, so Next's payload scripts were blocked and
 * React never hydrated on any page. It looked stricter and silently shipped a
 * dead site. The hash is gone for that reason.
 *
 * So script-src is the one weak directive here. The rest of this policy is
 * what carries the weight: an injected script still cannot reach any foreign
 * origin (connect-src is same-origin plus page-created blobs), post a stolen
 * form off-site (form-action 'self'), rewrite relative URLs (base-uri
 * 'self'), frame the page (frame-ancestors 'none') or load a plugin
 * (object-src 'none'). Exfiltration is the step that turns an injection into
 * a breach, and that is the step this blocks.
 */
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  // three.js compiles a WebAssembly decoder for the 3D cylinder viewer on the
  // home page. This grant covers WebAssembly compilation ONLY — it does not
  // permit eval() or new Function(), which is why it is not 'unsafe-eval'.
  "'wasm-unsafe-eval'",
  // React uses eval in development to rebuild server error stacks. Production
  // needs no eval, so it never gets it.
  ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
].join(" ");

/**
 * One thing stays deliberately blocked: Zod probes for JIT support with
 * `try { Function(""); return true } catch { return false }`. Blocking it
 * logs one CSP violation per page load and Zod silently uses its interpreted
 * validator instead — verified: every route still hydrates. Adding
 * 'unsafe-eval' to production to silence that log would trade the single
 * strongest directive we have for a cosmetic win.
 */

const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": scriptSrc,
  // Tailwind injects a stylesheet and framer-motion writes inline style
  // attributes on animated elements; both need this. Style injection is a
  // far weaker vector than script injection.
  "style-src": "'self' 'unsafe-inline'",
  // data: for the 2FA QR code and inlined icons; blob: for anything a
  // client generates in-page.
  "img-src": "'self' data: blob:",
  "font-src": "'self' data:",
  // Same-origin only. Every third party this app talks to — DHL, Telegram,
  // OpenAI, SMTP — is called from the server, never the browser.
  //
  // blob: is required: three.js's GLTFLoader fetches the 3D model's textures
  // back out of blob: URLs it created itself. Without it the model renders
  // untextured and the console fills with "Couldn't load texture". A blob:
  // URL is same-origin and page-created, so it is no exfiltration path.
  "connect-src": "'self' blob:",
  "media-src": "'self'",
  "worker-src": "'self' blob:",
  "manifest-src": "'self'",
  // Belt and braces with X-Frame-Options, and the only one of the two that
  // modern browsers actually consult.
  "frame-ancestors": "'none'",
  "frame-src": "'none'",
  "object-src": "'none'",
  // Stops a stolen page from POSTing credentials somewhere else.
  "form-action": "'self'",
  "base-uri": "'self'",
};

export function contentSecurityPolicy(): string {
  const directives = Object.entries(CSP_DIRECTIVES).map(([key, value]) => `${key} ${value}`);
  // Only meaningful over HTTPS, and it would break local development.
  if (process.env.NODE_ENV === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export interface HttpHeader {
  key: string;
  value: string;
}

export function securityHeaders(): HttpHeader[] {
  return [
    {
      // Stops the browser resolving DNS for links the user may never click,
      // which leaks browsing intent to a DNS provider.
      key: "X-DNS-Prefetch-Control",
      value: "off",
    },
    {
      // Two years, subdomains included, preload-list eligible. Ignored over
      // plain HTTP, so it is harmless in local development.
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      // DENY, not SAMEORIGIN: nothing in this app is meant to be framed, and
      // the checkout and admin screens are exactly what a clickjacking
      // overlay would target.
      key: "X-Frame-Options",
      value: "DENY",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      // None of these are used. Denying them means a compromised script
      // cannot quietly reach for a camera or a location either.
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    {
      // Keeps this origin out of any other site's browsing-context group,
      // which is what makes cross-origin isolation and Spectre mitigations
      // meaningful.
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin",
    },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  ];
}
