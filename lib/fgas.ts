// Contract shared by POST /api/verify-fgas and the cart's upload modal.
// Kept out of the route file so client components import types and
// validation limits without touching server-only modules (the AI prompt,
// the API key and the byte sniffing all live in lib/fgasVision.ts).

export const FGAS_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type FgasMediaType = (typeof FGAS_ACCEPTED_TYPES)[number];

/** Hard upload ceiling, enforced again server-side. */
export const FGAS_MAX_BYTES = 5 * 1024 * 1024;
export const FGAS_MAX_MB = FGAS_MAX_BYTES / (1024 * 1024);

export interface FgasExtraction {
  /** Certificate holder — the company (or sole trader) the certificate is issued to. */
  companyName: string;
  /** Certificate number exactly as printed on the document. */
  certificateId: string;
  /** F-Gas handling category ("Category I"…"Category IV"), or a neutral label when unstated. */
  category: string;
  /** ISO date (YYYY-MM-DD) */
  expiresAt: string;
  /**
   * Date of issue as printed, ISO (YYYY-MM-DD). Display only — it is never
   * a reason to accept or refuse a certificate. null when the document
   * doesn't state one legibly, and on records extracted before this field
   * existed.
   */
  issuedOn?: string | null;
  /** Certification body that issued it, when the document names one. */
  issuingBody: string | null;
}

export type VerifyFgasErrorCode =
  /** No file part in the request body. */
  | "NO_FILE"
  /** Declared media type outside the allowlist. */
  | "UNSUPPORTED_TYPE"
  /** Over FGAS_MAX_BYTES. */
  | "TOO_LARGE"
  /** Bytes don't match the declared type — renamed or truncated file. */
  | "CORRUPT_FILE"
  /** The model audited the document and refused it; `errorReason` says why. */
  | "REJECTED"
  /** No OPENAI_API_KEY on the server — an operator problem, not a user one. */
  | "AI_UNCONFIGURED"
  /** The vision call exceeded its time budget. */
  | "AI_TIMEOUT"
  /** The vision call failed (rate limit, upstream outage, unparseable output). */
  | "AI_ERROR"
  /** Anything else, including the database commit. */
  | "FAILED";

export type VerifyFgasResponse =
  /**
   * The document passed every acceptance criterion and the account is now
   * VERIFIED — checkout is unlocked without a human step. The decision, the
   * document and the AI's note go to the admin chat for audit either way.
   */
  | { verified: true; status: "VERIFIED"; extracted: FgasExtraction; submittedAt: string }
  /** Read for a signed-out visitor: returned, but nothing is stored. */
  | { verified: false; status: "GUEST"; extracted: FgasExtraction; submittedAt: string }
  | {
      verified: false;
      status?: undefined;
      code: VerifyFgasErrorCode;
      /**
       * Human-readable explanation. For REJECTED this is the auditor's own
       * finding ("this is a supermarket receipt, not a certificate") and is
       * safe to show the user; for the AI_* codes it is a short operator hint.
       */
      errorReason: string | null;
    };

export function isAcceptedFgasFile(file: File): boolean {
  return (FGAS_ACCEPTED_TYPES as readonly string[]).includes(file.type);
}
