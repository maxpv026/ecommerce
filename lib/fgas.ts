// Contract shared by POST /api/verify-fgas, the verification modal, the gates
// (cart, checkout, quotes) and the profile. Client-safe: no Prisma, no model,
// no secrets — those live in lib/fgasVision, lib/fgasLifecycle, lib/fgasStorage.

import type { FGasStatus } from "@/lib/generated/prisma/enums";

export const FGAS_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type FgasMediaType = (typeof FGAS_ACCEPTED_TYPES)[number];

/** Hard upload ceiling, enforced again server-side. */
export const FGAS_MAX_BYTES = 5 * 1024 * 1024;
export const FGAS_MAX_MB = FGAS_MAX_BYTES / (1024 * 1024);

export function isAcceptedFgasFile(file: File): boolean {
  return (FGAS_ACCEPTED_TYPES as readonly string[]).includes(file.type);
}

/** What the document said, as read. Every field is the document's, never ours. */
export interface FgasExtraction {
  /** Certificate holder — the company (or sole trader) it is issued to. */
  companyName: string | null;
  /** The person named on a personal certificate. */
  personName?: string | null;
  /** Certificate / registration number exactly as printed. */
  certificateId: string | null;
  /** "Category I"… or the scope as printed; a neutral label when unstated. */
  category: string;
  /** ISO YYYY-MM-DD; null when the document prints no expiry. */
  expiresAt: string | null;
  /** ISO YYYY-MM-DD, display only. */
  issuedOn?: string | null;
  issuingBody: string | null;
  /** ISO 3166-1 alpha-2 of the issuing EU member state. */
  countryCode?: string | null;
  /** "517/2014" | "2024/573" | "842/2006" | "national_only" | "none". */
  regulationCited?: string | null;
  vatNumber?: string | null;
}

// ── The verdict ──────────────────────────────────────────────────────────

export type FgasVerdict = "VERIFIED" | "PENDING_REVIEW" | "REJECTED";

export type FgasCheckId = "document" | "regulation" | "scope" | "expiry" | "authenticity" | "fields" | "holder" | "duplicate";

/**
 * One line of the itemised result. `outcome` drives the verdict: any "fail"
 * rejects, otherwise any "review" routes to a person, otherwise verified.
 * `code` is a stable key the UI words in the buyer's language.
 */
export interface FgasCheck {
  id: FgasCheckId;
  outcome: "pass" | "review" | "fail";
  code: string;
  /** A value worth showing next to it (a date, a regulation, a name). */
  detail?: string | null;
}

export function verdictFromChecks(checks: FgasCheck[]): FgasVerdict {
  if (checks.some((c) => c.outcome === "fail")) return "REJECTED";
  if (checks.some((c) => c.outcome === "review")) return "PENDING_REVIEW";
  return "VERIFIED";
}

export type VerifyFgasErrorCode =
  | "SIGN_IN_REQUIRED"
  | "NO_FILE"
  | "UNSUPPORTED_TYPE"
  | "TOO_LARGE"
  | "CORRUPT_FILE"
  | "AI_UNCONFIGURED"
  | "AI_TIMEOUT"
  | "AI_ERROR"
  | "FAILED";

export type VerifyFgasResult = {
  ok: true;
  /** What THIS document was judged to be. */
  verdict: FgasVerdict;
  /** The account's status afterwards (may differ — see keptActive). */
  accountStatus: FGasStatus;
  /**
   * A buyer already VERIFIED uploaded a replacement that was not accepted:
   * their current certificate stays in force.
   */
  keptActive: boolean;
  extracted: FgasExtraction | null;
  checks: FgasCheck[];
  /** One sentence for the buyer, already specific to what failed or why it's in review. */
  reason: string | null;
  submittedAt: string;
};

export type VerifyFgasError = { ok: false; code: VerifyFgasErrorCode; errorReason: string | null };
export type VerifyFgasResponse = VerifyFgasResult | VerifyFgasError;

/** NDJSON events of the streamed variant (?stream=1): stages 1–4, then the result. */
export type VerifyFgasEvent = { type: "stage"; stage: 1 | 2 | 3 | 4 } | { type: "result"; result: VerifyFgasResponse };

// ── Effective status ─────────────────────────────────────────────────────

/**
 * The status every gate must use. A VERIFIED row whose certificate expired is
 * EXPIRED from that instant — the daily cron writes it down and emails the
 * buyer, but nobody waits for the cron to stop a sale.
 */
export function getEffectiveFgasStatus(user: { fGasStatus: FGasStatus; fGasExpiresAt?: Date | string | null }, now: Date = new Date()): FGasStatus {
  if (user.fGasStatus !== "VERIFIED" || !user.fGasExpiresAt) return user.fGasStatus;
  const expires = new Date(user.fGasExpiresAt);
  return expires.getTime() < now.getTime() ? "EXPIRED" : "VERIFIED";
}

export const isFgasCleared = (status: FGasStatus) => status === "VERIFIED";

/** Whole days until expiry (negative once past); null for no expiry. */
export function daysUntil(date: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.floor((new Date(date).getTime() - now.getTime()) / 86_400_000);
}

/** Who decided, in fGasReviewedBy / FgasAuditLog.actorId. */
export const AI_ACTOR = "ai-vision";
/** The value used before the audit log; still recognised. */
export const LEGACY_AI_ACTOR = "ai-auto-verification";
export const isAiActor = (actor: string | null | undefined) => actor === AI_ACTOR || actor === LEGACY_AI_ACTOR;

// ── What every buyer-facing surface shows ────────────────────────────────

/** A buyer's F-Gas standing, as the cart, checkout and profile render it. */
export interface FgasSummary {
  /** Effective: VERIFIED past its expiry is EXPIRED here. */
  status: FGasStatus;
  certificateNumber: string | null;
  holder: string | null;
  issuingBody: string | null;
  countryCode: string | null;
  category: string | null;
  /** ISO date-time; null when none is on file. */
  expiresAt: string | null;
  daysLeft: number | null;
  /** Why the last submission was refused or sent for review. */
  reason: string | null;
  /** The itemised checks of the latest automatic verdict, when it wasn't accepted. */
  checks: FgasCheck[] | null;
  /** A VERIFIED buyer's replacement is with a specialist. */
  replacementPending: boolean;
  /** Authenticated link to the current document. */
  documentHref: string | null;
}
