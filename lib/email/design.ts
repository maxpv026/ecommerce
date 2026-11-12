/**
 * The My Energy email design system: one shell, one set of blocks, every
 * message.
 *
 * Every email the shop sends (order confirmation, shipping, cart and
 * restock reminders, price drop, back in stock, F-Gas notices, security
 * codes, broadcasts, support) is described as an `EmailDoc` (data, no
 * markup) and rendered here into BOTH parts of the message: the HTML and the
 * plain-text alternative. Nothing else in the codebase writes email markup,
 * so the emails cannot drift apart again.
 *
 * Pure and dependency-free (no Prisma, no React, no `server-only`) so it can
 * be rendered from a webhook, a cron, a server action or a test script.
 *
 * ── Dark mode, client by client ──
 * The design is light-first, built from neutrals, because the one client
 * that cannot be steered (Gmail on iOS/Android) applies a full colour
 * inversion to whatever it gets: a dark header turns pale lavender, a
 * mid-blue turns pastel. Neutrals invert cleanly, so the layout is made of
 * them, and the two brand-coloured things are protected explicitly:
 *
 *   Apple Mail, iOS Mail, Outlook (macOS/iOS), Hey  `prefers-color-scheme`
 *       → a hand-tuned dark palette via the `me-*` classes below.
 *   Outlook.com / Outlook apps  `[data-ogsc]` / `[data-ogsb]` → same palette.
 *   Gmail iOS/Android (inverts, ignores the media query):
 *     - the CTA's blue is ALSO painted as a background-image gradient, which
 *       Gmail does not invert, so the button stays #2563EB;
 *     - its white label sits in the `u + .body` screen/difference blend pair,
 *       which cancels the inversion of the text colour (white stays white);
 *     - money, figures and the logo are ink, never blue, so they invert to
 *       near-white instead of washed-out purple.
 *   Outlook for Windows (Word engine): a VML button and a fixed 600px ghost
 *       table; border-radius degrades to square corners.
 *
 * ── Layout rules ──
 * Tables only (no flex/grid: Gmail strips them, which is how the logo ended
 * up touching the wordmark). Spacing is cell padding. Every figure cell is
 * `white-space: nowrap` and right-aligned, so a price never wraps; metadata
 * is split into nowrap segments, so a long line breaks only between
 * segments, never inside a SKU.
 */

// ───────────────────────────── model ─────────────────────────────

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

/** Inline rich text: plain strings, bold, monospace and links. */
export type RichSegment = string | { b: string } | { mono: string } | { a: string; href: string };
export type Rich = string | RichSegment[];

export interface ItemLine {
  name: string;
  qty?: number;
  /** Rendered as one line of nowrap segments joined by " · ". */
  meta: string[];
  badges?: Array<{ label: string; tone: Tone }>;
  /** Line total (formatted); omitted for lists without money. */
  total?: string;
  /** Previous price, shown struck through above the total. */
  was?: string;
  /** Dims the line (e.g. out of stock, not counted in the totals). */
  muted?: boolean;
}

export type Block =
  | { kind: "text"; text: Rich; tone?: "body" | "muted" | "small" }
  | { kind: "items"; lines: ItemLine[]; qtyLabel: string }
  | { kind: "ledger"; rows: Array<{ label: string; value: string }>; total: { label: string; value: string }; note?: string }
  | { kind: "facts"; title?: string; rows: Array<{ label: string; value: string; mono?: boolean; note?: string }> }
  | { kind: "callout"; tone: Tone; title?: string; text: Rich }
  | { kind: "code"; code: string; caption?: string }
  | { kind: "cta"; label: string; href: string; note?: string }
  | { kind: "quote"; text: string }
  | { kind: "divider" };

export interface EmailChrome {
  /** "European B2B Refrigerant & HVAC Supply" */
  tagline: string;
  /** "EU F-Gas Regulation (EU) 2024/573" */
  regulation: string;
  /** Account dashboard · Orders & invoices · SDS library · Notification preferences */
  links: Array<{ label: string; href: string }>;
  /** "My Energy · Address line · …", the legal sender. */
  sender: string;
  /** The brand wordmark. */
  brand: string;
}

export interface EmailDoc {
  lang: string;
  /** The <title> and the plain-text heading. */
  subject: string;
  /** Inbox preview line (hidden preheader). */
  preview: string;
  /** The right-hand monospace badge: a document number or the message type. */
  reference: string;
  /** Optional small label above the heading. */
  kicker?: { label: string; tone?: Tone };
  heading: string;
  /** Amber strip above the card ("Test email — …"). */
  testBanner?: string | null;
  blocks: Block[];
  footer: {
    /** Why this email was sent. */
    reason?: Rich;
    /** Non-transactional emails only: the signed one-click link. */
    unsubscribe?: { label: string; href: string } | null;
  };
}

// ───────────────────────────── tokens ─────────────────────────────

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const C = {
  page: "#F3F4F6",
  card: "#FFFFFF",
  border: "#E5E7EB",
  hairline: "#EEF0F3",
  soft: "#F8FAFC",
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  brand: "#2563EB",
  link: "#1D4ED8",
} as const;

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: "#475569", bg: "#F1F5F9", border: "#CBD5E1" },
  brand: { fg: "#1D4ED8", bg: "#EFF6FF", border: "#2563EB" },
  success: { fg: "#047857", bg: "#ECFDF5", border: "#10B981" },
  warning: { fg: "#B45309", bg: "#FFFBEB", border: "#F59E0B" },
  danger: { fg: "#B91C1C", bg: "#FEF2F2", border: "#EF4444" },
  info: { fg: "#1D4ED8", bg: "#EFF6FF", border: "#3B82F6" },
};

/** The dark palette, applied by the clients that honour it (see header). */
const DARK = {
  page: "#0B0D12",
  card: "#12151C",
  border: "#262B36",
  soft: "#171B24",
  ink: "#F1F5F9",
  body: "#CBD5E1",
  muted: "#94A3B8",
  faint: "#6B7280",
  link: "#8DB0FF",
  tones: {
    neutral: { fg: "#CBD5E1", bg: "#1E2430" },
    brand: { fg: "#93B4FF", bg: "#0F1D3A" },
    success: { fg: "#6EE7B7", bg: "#062A1E" },
    warning: { fg: "#FCD34D", bg: "#2B1F06" },
    danger: { fg: "#FCA5A5", bg: "#2C0F10" },
    info: { fg: "#93C5FD", bg: "#0C1B35" },
  } satisfies Record<Tone, { fg: string; bg: string }>,
};

const TONE_NAMES = Object.keys(TONES) as Tone[];

function darkRules(prefix: string): string {
  const p = (cls: string) => `${prefix}.${cls}`;
  return [
    `${p("me-bg")}{background-color:${DARK.page} !important}`,
    `${p("me-card")}{background-color:${DARK.card} !important;border-color:${DARK.border} !important}`,
    `${p("me-soft")}{background-color:${DARK.soft} !important;border-color:${DARK.border} !important}`,
    `${p("me-line")}{border-color:${DARK.border} !important}`,
    `${p("me-ink")}{color:${DARK.ink} !important}`,
    `${p("me-body")}{color:${DARK.body} !important}`,
    `${p("me-muted")}{color:${DARK.muted} !important}`,
    `${p("me-faint")}{color:${DARK.faint} !important}`,
    `${p("me-link")}{color:${DARK.link} !important}`,
    `${p("me-ring")}{border-color:${DARK.ink} !important}`,
    `${p("me-badge")}{background-color:${DARK.soft} !important;border-color:${DARK.border} !important;color:${DARK.body} !important}`,
    `${p("me-total")}{border-color:${DARK.ink} !important}`,
    ...TONE_NAMES.map((t) => `${p(`me-tone-${t}`)}{color:${DARK.tones[t].fg} !important;background-color:${DARK.tones[t].bg} !important}`),
    ...TONE_NAMES.map((t) => `${p(`me-fg-${t}`)}{color:${DARK.tones[t].fg} !important}`),
  ].join("\n");
}

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0 !important;padding:0 !important;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
table{border-collapse:collapse !important}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a{text-decoration:none}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important}
u + .body a{color:inherit}
u + .body .me-gm-screen{background:#000000;mix-blend-mode:screen;display:inline-block}
u + .body .me-gm-diff{background:#000000;mix-blend-mode:difference;display:inline-block}
@media only screen and (max-width:620px){
.me-outer{padding:12px 8px 24px !important}
.me-pad{padding-left:20px !important;padding-right:20px !important}
.me-h1{font-size:22px !important;line-height:28px !important}
.me-stack{display:block !important;width:100% !important;box-sizing:border-box;padding-left:0 !important;padding-right:0 !important}
.me-stack-gap{padding-top:12px !important}
.me-btn-table{width:100% !important}
.me-btn-cell,.me-btn{display:block !important;width:100% !important;box-sizing:border-box;text-align:center !important}
}
@media (prefers-color-scheme:dark){
${darkRules("")}
}
${darkRules("[data-ogsc] ")}
${darkRules("[data-ogsb] ")}
`.trim();

// ───────────────────────────── helpers ─────────────────────────────

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESC[c]!);

/** Only absolute web and mail links are ever put in an href. */
function safeHref(href: string): string {
  return /^(https?:|mailto:)/i.test(href.trim()) ? escapeHtml(href.trim()) : "#";
}

const style = (rules: Record<string, string | number | undefined>) =>
  Object.entries(rules)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(";");

function richHtml(text: Rich, linkClass = "me-link"): string {
  const segs = typeof text === "string" ? [text] : text;
  return segs
    .map((s) => {
      if (typeof s === "string") return escapeHtml(s).replace(/\n/g, "<br>");
      if ("b" in s) return `<strong class="me-ink" style="font-weight:600;color:${C.ink}">${escapeHtml(s.b)}</strong>`;
      if ("mono" in s) return `<span class="me-ink" style="font-family:${MONO};font-size:0.94em;color:${C.ink};white-space:nowrap">${escapeHtml(s.mono)}</span>`;
      return `<a href="${safeHref(s.href)}" class="${linkClass}" style="color:${C.link};text-decoration:underline">${escapeHtml(s.a)}</a>`;
    })
    .join("");
}

function richText(text: Rich): string {
  const segs = typeof text === "string" ? [text] : text;
  return segs
    .map((s) => {
      if (typeof s === "string") return s;
      if ("b" in s) return s.b;
      if ("mono" in s) return s.mono;
      return s.a === s.href ? s.href : `${s.a} (${s.href})`;
    })
    .join("");
}

function badgeHtml(label: string, tone: Tone): string {
  const t = TONES[tone];
  return `<span class="me-tone-${tone}" style="${style({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    backgroundColor: t.bg,
    color: t.fg,
    fontSize: "11.5px",
    lineHeight: "17px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  })}">${escapeHtml(label)}</span>`;
}

/** Rough VML width for Outlook's button: it cannot size to its label. */
const vmlWidth = (label: string) => Math.min(520, Math.max(180, Math.round(label.length * 8.6 + 64)));

// ───────────────────────────── blocks: HTML ─────────────────────────────

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "text": {
      const tone = block.tone ?? "body";
      const rules =
        tone === "body"
          ? { cls: "me-body", color: C.body, size: "15px", line: "24px" }
          : tone === "muted"
            ? { cls: "me-muted", color: C.muted, size: "14px", line: "22px" }
            : { cls: "me-muted", color: C.muted, size: "12.5px", line: "19px" };
      return `<p class="${rules.cls}" style="${style({ margin: "0 0 16px", fontSize: rules.size, lineHeight: rules.line, color: rules.color })}">${richHtml(block.text)}</p>`;
    }

    case "items": {
      const rows = block.lines
        .map((line, i) => {
          const top = i === 0 ? `border-top:1px solid ${C.border};` : "";
          const nameColor = line.muted ? C.muted : C.ink;
          const qty =
            line.qty !== undefined
              ? `&nbsp;<span class="me-badge" style="${style({
                  display: "inline-block",
                  marginLeft: "4px",
                  padding: "0 7px",
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  backgroundColor: C.soft,
                  color: C.body,
                  fontFamily: MONO,
                  fontSize: "12px",
                  lineHeight: "19px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  verticalAlign: "1px",
                })}">&times;&nbsp;${line.qty}</span>`
              : "";
          const meta = line.meta.length
            ? `<div class="me-muted me-meta" style="${style({ marginTop: "3px", fontFamily: MONO, fontSize: "12px", lineHeight: "18px", color: C.muted })}">${line.meta
                .map((m) => `<span style="white-space:nowrap">${escapeHtml(m)}</span>`)
                .join(" &middot; ")}</div>`
            : "";
          const badges = line.badges?.length
            ? `<div style="margin-top:7px">${line.badges.map((b) => badgeHtml(b.label, b.tone)).join("&nbsp; ")}</div>`
            : "";
          const was = line.was
            ? `<div class="me-faint" style="${style({ fontFamily: MONO, fontSize: "12px", lineHeight: "18px", color: C.faint, textDecoration: "line-through", whiteSpace: "nowrap" })}">${escapeHtml(line.was)}</div>`
            : "";
          const total = line.total
            ? `<span class="${line.muted ? "me-muted" : "me-ink"}" style="${style({ fontFamily: MONO, fontSize: "14.5px", lineHeight: "20px", fontWeight: 600, color: line.muted ? C.muted : C.ink, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" })}">${escapeHtml(line.total)}</span>`
            : "";
          // Two rows: name + qty | total, then the metadata and badges across
          // the FULL width — a phone-width total column never squeezes them.
          return `<tr>
<td class="me-line" width="72%" valign="top" style="${top}width:72%;padding:14px 12px 0 0;vertical-align:top">
<div class="${line.muted ? "me-muted" : "me-ink"}" style="${style({ fontSize: "14.5px", lineHeight: "21px", fontWeight: 600, color: nameColor })}">${escapeHtml(line.name)}${qty}</div>
</td>
<td class="me-line" width="28%" align="right" valign="top" style="${top}width:28%;padding:14px 0 0;text-align:right;vertical-align:top;white-space:nowrap">${was}${total}</td>
</tr>
<tr><td class="me-line" colspan="2" style="border-bottom:1px solid ${C.hairline};padding:0 0 14px">${meta}${badges}</td></tr>`;
        })
        .join("\n");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 18px">${rows}</table>`;
    }

    case "ledger": {
      const row = (label: string, value: string) => `<tr>
<td class="me-muted" style="padding:5px 12px 5px 0;font-size:13.5px;line-height:20px;color:${C.muted}">${escapeHtml(label)}</td>
<td class="me-ink" align="right" style="padding:5px 0;font-family:${MONO};font-size:13.5px;line-height:20px;color:${C.ink};text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${escapeHtml(value)}</td>
</tr>`;
      const total = `<tr>
<td class="me-ink me-total" style="padding:12px 12px 0 0;border-top:1px solid ${C.ink};font-size:15px;line-height:22px;font-weight:700;color:${C.ink}">${escapeHtml(block.total.label)}</td>
<td class="me-ink me-total" align="right" style="padding:12px 0 0;border-top:1px solid ${C.ink};font-family:${MONO};font-size:19px;line-height:24px;font-weight:700;color:${C.ink};text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${escapeHtml(block.total.value)}</td>
</tr>`;
      const note = block.note
        ? `<p class="me-muted" style="margin:10px 0 0;font-size:12.5px;line-height:19px;color:${C.muted}">${escapeHtml(block.note)}</p>`
        : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 4px">${block.rows.map((r) => row(r.label, r.value)).join("")}<tr><td colspan="2" style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>${total}</table>${note}<div style="height:22px;line-height:22px;font-size:0">&nbsp;</div>`;
    }

    case "facts": {
      const cell = (r: { label: string; value: string; mono?: boolean; note?: string } | undefined, second: boolean) =>
        r
          ? `<td class="me-stack${second ? " me-stack-gap" : ""}" width="50%" valign="top" style="width:50%;padding:${second ? "0 0 0 10px" : "0 10px 0 0"};vertical-align:top">
<div class="me-muted" style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:${C.muted}">${escapeHtml(r.label)}</div>
<div class="me-ink" style="${style({ marginTop: "3px", fontSize: r.mono ? "13px" : "13.5px", lineHeight: "20px", color: C.ink, fontFamily: r.mono ? MONO : undefined, fontWeight: 500 })}">${escapeHtml(r.value).replace(/\n/g, "<br>")}</div>${
              r.note ? `<div class="me-muted" style="margin-top:1px;font-size:12px;line-height:17px;color:${C.muted}">${escapeHtml(r.note)}</div>` : ""
            }
</td>`
          : `<td class="me-stack" width="50%" style="width:50%">&nbsp;</td>`;
      const pairs: string[] = [];
      for (let i = 0; i < block.rows.length; i += 2) {
        pairs.push(`<tr>${cell(block.rows[i], false)}${cell(block.rows[i + 1], true)}</tr>${i + 2 < block.rows.length ? `<tr><td colspan="2" style="height:14px;line-height:14px;font-size:0">&nbsp;</td></tr>` : ""}`);
      }
      const title = block.title
        ? `<div class="me-ink" style="margin:0 0 12px;font-size:13px;line-height:18px;font-weight:700;color:${C.ink}">${escapeHtml(block.title)}</div>`
        : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 18px"><tr><td class="me-soft" style="padding:16px 18px;background-color:${C.soft};border:1px solid ${C.border};border-radius:10px">${title}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">${pairs.join("")}</table></td></tr></table>`;
    }

    case "callout": {
      const t = TONES[block.tone];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 18px"><tr><td class="me-soft" style="padding:12px 16px;background-color:${C.soft};border-left:3px solid ${t.border};border-radius:0 8px 8px 0">${
        block.title ? `<div class="me-fg-${block.tone}" style="margin:0 0 3px;font-size:12.5px;line-height:18px;font-weight:700;color:${t.fg}">${escapeHtml(block.title)}</div>` : ""
      }<div class="me-body" style="font-size:13.5px;line-height:21px;color:${C.body}">${richHtml(block.text)}</div></td></tr></table>`;
    }

    case "code":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 18px"><tr><td class="me-soft" align="center" style="padding:22px 16px;background-color:${C.soft};border:1px solid ${C.border};border-radius:10px;text-align:center">
<div class="me-ink" style="font-family:${MONO};font-size:32px;line-height:38px;font-weight:700;letter-spacing:.28em;color:${C.ink};white-space:nowrap">${escapeHtml(block.code)}</div>${
        block.caption ? `<div class="me-muted" style="margin-top:8px;font-size:12px;line-height:17px;color:${C.muted}">${escapeHtml(block.caption)}</div>` : ""
      }
</td></tr></table>`;

    case "cta": {
      const href = safeHref(block.href);
      // A trailing arrow stays on the line with the last word.
      const label = escapeHtml(block.label).replace(/\s+([→›»])$/, "&nbsp;$1");
      return `<table role="presentation" class="me-btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 ${block.note ? "12px" : "22px"}"><tr><td class="me-btn-cell" style="border-radius:10px;background-color:${C.brand}">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${vmlWidth(block.label)}px" arcsize="21%" stroke="f" fillcolor="${C.brand}"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-- --><a href="${href}" class="me-btn" target="_blank" style="display:inline-block;background-color:${C.brand};background-image:linear-gradient(${C.brand},${C.brand});color:#ffffff !important;border-radius:10px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;letter-spacing:-0.01em;padding:14px 28px;text-decoration:none;mso-hide:all"><span class="me-gm-screen"><span class="me-gm-diff" style="color:#ffffff">${label}</span></span></a><!--<![endif]-->
</td></tr></table>${block.note ? `<p class="me-muted" style="margin:0 0 22px;font-size:12.5px;line-height:19px;color:${C.muted}">${escapeHtml(block.note)}</p>` : ""}`;
    }

    case "quote":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 18px"><tr><td class="me-soft me-ink" style="padding:12px 16px;background-color:${C.soft};border-left:3px solid ${C.border};font-size:14.5px;line-height:23px;color:${C.ink};white-space:pre-line">${escapeHtml(block.text)}</td></tr></table>`;

    case "divider":
      return `<div class="me-line" style="height:1px;line-height:1px;font-size:0;border-top:1px solid ${C.border};margin:6px 0 20px">&nbsp;</div>`;
  }
}

// ───────────────────────────── blocks: text ─────────────────────────────

function blockText(block: Block): string {
  switch (block.kind) {
    case "text":
      return richText(block.text);
    case "items":
      return block.lines
        .map((l) =>
          [
            `• ${l.name}${l.qty !== undefined ? ` — ${block.qtyLabel}: ${l.qty}` : ""}${l.total ? `  ${l.total}` : ""}${l.was ? ` (${l.was})` : ""}`,
            l.meta.length ? `  ${l.meta.join(" · ")}` : "",
            l.badges?.length ? `  ${l.badges.map((b) => b.label).join(" · ")}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n");
    case "ledger":
      return [...block.rows.map((r) => `${r.label}: ${r.value}`), "—".repeat(24), `${block.total.label}: ${block.total.value}`, block.note ?? ""]
        .filter(Boolean)
        .join("\n");
    case "facts":
      return [block.title ? block.title.toUpperCase() : "", ...block.rows.map((r) => `${r.label}: ${r.value.replace(/\n/g, ", ")}${r.note ? ` (${r.note})` : ""}`)]
        .filter(Boolean)
        .join("\n");
    case "callout":
      return `${block.title ? `${block.title}: ` : ""}${richText(block.text)}`;
    case "code":
      return `    ${block.code}${block.caption ? `\n    ${block.caption}` : ""}`;
    case "cta":
      return `${block.label.replace(/\s*[→›»]\s*$/, "")}: ${block.href}${block.note ? `\n${block.note}` : ""}`;
    case "quote":
      return block.text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "divider":
      return "—".repeat(24);
  }
}

// ───────────────────────────── shell ─────────────────────────────

/** Renders one email to its HTML and plain-text parts. */
export function renderEmail(doc: EmailDoc, chrome: EmailChrome): { html: string; text: string } {
  return { html: renderHtml(doc, chrome), text: renderText(doc, chrome) };
}

function renderHtml(doc: EmailDoc, chrome: EmailChrome): string {
  const kicker = doc.kicker
    ? `<p class="me-fg-${doc.kicker.tone ?? "neutral"}" style="margin:0 0 8px;font-size:11.5px;line-height:16px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${TONES[doc.kicker.tone ?? "neutral"].fg}">${escapeHtml(doc.kicker.label)}</p>`
    : "";

  const testBanner = doc.testBanner
    ? `<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr><td class="me-tone-warning" style="padding:9px 14px;border-radius:8px;background-color:${TONES.warning.bg};color:#92400E;font-size:12.5px;line-height:18px">${escapeHtml(doc.testBanner)}</td></tr></table></td></tr>`
    : "";

  const header = `<tr><td class="me-pad me-line" style="padding:18px 32px;border-bottom:1px solid ${C.border}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr>
<td valign="middle" style="vertical-align:middle">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="14" style="width:14px;vertical-align:middle;padding:0"><div class="me-ring" style="width:8px;height:8px;border:3px solid ${C.ink};border-radius:50%;font-size:0;line-height:0">&nbsp;</div></td>
<td valign="middle" class="me-ink" style="vertical-align:middle;padding:0 0 0 10px;font-family:${FONT};font-size:15.5px;line-height:20px;font-weight:650;letter-spacing:-0.02em;color:${C.ink};white-space:nowrap">${escapeHtml(chrome.brand)}</td>
</tr></table>
</td>
<td valign="middle" align="right" style="vertical-align:middle;text-align:right;padding-left:12px"><span class="me-badge" style="display:inline-block;padding:4px 9px;border:1px solid ${C.border};border-radius:6px;background-color:${C.soft};color:#475569;font-family:${MONO};font-size:11px;line-height:15px;font-weight:600;letter-spacing:.04em;white-space:nowrap">${escapeHtml(doc.reference)}</span></td>
</tr></table>
</td></tr>`;

  const body = `<tr><td class="me-pad" style="padding:30px 32px 10px">
${kicker}<h1 class="me-ink me-h1" style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:31px;font-weight:700;letter-spacing:-0.025em;color:${C.ink}">${escapeHtml(doc.heading)}</h1>
${doc.blocks.map(blockHtml).join("\n")}
</td></tr>`;

  const linkRow = chrome.links
    .map((l) => `<a href="${safeHref(l.href)}" class="me-muted" style="color:${C.muted};text-decoration:underline;white-space:nowrap">${escapeHtml(l.label)}</a>`)
    .join(` <span class="me-faint" style="color:${C.faint}">&middot;</span> `);
  const reason = doc.footer.reason ? `<p class="me-muted" style="margin:0 0 8px">${richHtml(doc.footer.reason, "me-muted")}</p>` : "";
  const unsubscribe = doc.footer.unsubscribe
    ? `<p style="margin:0 0 8px"><a href="${safeHref(doc.footer.unsubscribe.href)}" class="me-muted" style="color:${C.muted};text-decoration:underline;font-weight:600">${escapeHtml(doc.footer.unsubscribe.label)}</a></p>`
    : "";

  const footer = `<tr><td class="me-pad" style="padding:22px 32px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted}">
<p class="me-muted" style="margin:0 0 8px;color:${C.muted}"><strong class="me-body" style="font-weight:600;color:${C.body}">${escapeHtml(chrome.brand)}</strong> &middot; ${escapeHtml(chrome.tagline)} &middot; <span style="white-space:nowrap">${escapeHtml(chrome.regulation)}</span></p>
<p class="me-muted" style="margin:0 0 8px;color:${C.muted}">${linkRow}</p>
${reason}${unsubscribe}<p class="me-faint" style="margin:0;color:${C.faint}">${escapeHtml(chrome.sender)}</p>
</td></tr>`;

  // Keeps the body copy out of the inbox preview after the preheader.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(60);

  return `<!doctype html>
<html lang="${escapeHtml(doc.lang)}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(doc.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
${STYLE}
</style>
</head>
<body class="body me-bg" style="margin:0;padding:0;background-color:${C.page};font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page}">${escapeHtml(doc.preview)}${spacer}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="me-bg" bgcolor="${C.page}" style="width:100%;background-color:${C.page}">
<tr><td align="center" class="me-outer" style="padding:32px 12px 40px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
${testBanner}<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="me-card" bgcolor="${C.card}" style="width:100%;background-color:${C.card};border:1px solid ${C.border};border-radius:14px;border-collapse:separate !important;overflow:hidden">
${header}
${body}
</table>
</td></tr>
${footer}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

function renderText(doc: EmailDoc, chrome: EmailChrome): string {
  const parts = [
    `${chrome.brand.toUpperCase()} · ${doc.reference}`,
    doc.testBanner ? `[${doc.testBanner}]` : "",
    doc.kicker ? doc.kicker.label.toUpperCase() : "",
    doc.heading,
    "",
    ...doc.blocks.map((b) => `${blockText(b)}\n`),
    "—".repeat(24),
    `${chrome.brand} · ${chrome.tagline} · ${chrome.regulation}`,
    chrome.links.map((l) => `${l.label}: ${l.href}`).join("\n"),
    doc.footer.reason ? richText(doc.footer.reason) : "",
    doc.footer.unsubscribe ? `${doc.footer.unsubscribe.label}: ${doc.footer.unsubscribe.href}` : "",
    chrome.sender,
  ];
  return parts
    .filter((p, i) => p !== "" || i === 4)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
