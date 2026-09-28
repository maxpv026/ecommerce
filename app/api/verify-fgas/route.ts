import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  FGAS_MAX_BYTES,
  FGAS_MAX_MB,
  isAcceptedFgasFile,
  type FgasExtraction,
  type FgasMediaType,
  type VerifyFgasErrorCode,
  type VerifyFgasResponse,
} from "@/lib/fgas";
import {
  AI_TIMEOUT_MS,
  analyzeCertificate,
  bytesMatchDeclaredType,
  isVisionConfigured,
  partialExtraction,
  type Verdict,
} from "@/lib/fgasVision";
import { storeCertificate, type StoredCertificate } from "@/lib/fgasStorage";
import { AI_REVIEWER_ID, buildAuditCaption, ensureCertificateRow } from "@/lib/fgasReview";
import { notifyAdminWithDocument } from "@/lib/telegram";

// Route handlers run on Node.js in this Next.js version (no Edge split) —
// the vision round-trip plus the Prisma write both need it.
// The AI budget (15 s), plus the storage upload and the Telegram send.
export const maxDuration = 60;

// Nothing here is cacheable: every call reads a fresh upload and may write.
export const dynamic = "force-dynamic";

/**
 * POST /api/verify-fgas
 *
 * Body: multipart/form-data with a single `certificate` file part
 * (application/pdf, image/jpeg, image/png or image/webp, max 5 MB).
 *
 *   curl -X POST https://shop.example.com/api/verify-fgas \
 *     -F 'certificate=@/path/to/fgas-certificate.pdf'
 *
 * The document is read and judged by a vision model (see lib/fgasVision.ts),
 * whose verdict is then re-checked field by field in code. A document that
 * survives both is stored and the buyer is moved straight to VERIFIED —
 * there is no human in the loop. One that does not is stored too, and the
 * buyer is moved to REJECTED with the reason they are shown.
 *
 * Every decision on a signed-in account — approval and refusal alike — sends
 * the document itself to the admin chat with the verdict in the caption.
 * That audit trail is the compensating control for auto-approval: it is how
 * a wrong call gets noticed and overturned (lib/fgasReview.ts).
 *
 * Responses:
 *   200 { verified: true,  status: "VERIFIED", extracted, submittedAt }
 *   200 { verified: false, status: "GUEST",    extracted, submittedAt }
 *   400 NO_FILE            no file part in the request
 *   413 TOO_LARGE          over 5 MB
 *   415 UNSUPPORTED_TYPE   media type outside the allowlist
 *   415 CORRUPT_FILE       bytes don't match the declared media type
 *   422 REJECTED           audited and refused; `errorReason` explains why
 *   500 AI_UNCONFIGURED    OPENAI_API_KEY missing on the server
 *   502 AI_ERROR           upstream vision failure
 *   504 AI_TIMEOUT         audit exceeded its 15 s budget
 *   500 FAILED             database commit failed
 *
 * A guest gets the reading back but nothing is stored and nothing is sent:
 * there is no account to grant, refuse or audit against, and guests cannot
 * check out regardless.
 */

const STATUS: Record<VerifyFgasErrorCode, number> = {
  NO_FILE: 400,
  UNSUPPORTED_TYPE: 415,
  TOO_LARGE: 413,
  CORRUPT_FILE: 415,
  REJECTED: 422,
  AI_UNCONFIGURED: 500,
  AI_TIMEOUT: 504,
  AI_ERROR: 502,
  FAILED: 500,
};

const fail = (code: VerifyFgasErrorCode, errorReason: string | null = null) =>
  Response.json({ verified: false, code, errorReason } satisfies VerifyFgasResponse, { status: STATUS[code] });

/**
 * Writes the AI's decision onto the account.
 *
 * Both outcomes are recorded the same way — same document, same timestamps,
 * same reviewer — so the account's history reads identically whether it was
 * approved or refused, and an admin can see exactly what was decided and on
 * what. `epaVerified` is kept in lockstep for readers not yet migrated off
 * it; letting the two disagree would let a refused buyer through an old gate.
 */
async function recordDecision(
  userId: string,
  decision: {
    status: "VERIFIED" | "REJECTED";
    extraction: FgasExtraction | null;
    reason: string | null;
    documentUrl: string;
    submittedAt: string;
  }
) {
  const verified = decision.status === "VERIFIED";
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      fGasStatus: decision.status,
      epaVerified: verified,
      fGasDocumentUrl: decision.documentUrl,
      fGasExtractedData: decision.extraction
        ? (decision.extraction as unknown as Prisma.InputJsonValue)
        : // Clear a previous reading rather than leaving it next to a fresh
          // refusal, where it would read as though it belonged to it.
          Prisma.DbNull,
      fGasSubmittedAt: new Date(decision.submittedAt),
      fGasReviewedAt: now,
      fGasReviewedBy: AI_REVIEWER_ID,
      fGasRejectionReason: verified ? null : decision.reason,
    },
  });

  // The certificate row is what the profile and order history display.
  if (verified && decision.extraction) await ensureCertificateRow(userId, decision.extraction);

  revalidatePath("/[locale]/profile", "page");
  revalidatePath("/[locale]/cart", "page");
}

/**
 * Sends the document and the verdict to the admin chat.
 *
 * Unconditional: an approval is exactly as interesting as a refusal here,
 * because an approval is the one nobody else will ever look at. Never fatal
 * — the decision is already committed — but a failure is logged loudly,
 * since a missing send means this particular sale went through unobserved.
 */
async function sendAuditCopy(input: {
  verdict: Verdict | null;
  approved: boolean;
  reason: string | null;
  stored: StoredCertificate;
  bytes: Uint8Array;
  contentType: string;
  userId: string;
  email: string | null;
  name: string | null;
}) {
  const result = await notifyAdminWithDocument(
    // Blob URLs are public-but-unguessable, so Telegram can fetch them.
    // Local storage is private by design, so the bytes go up directly.
    input.stored.driver === "blob"
      ? input.stored.url
      : {
          bytes: input.bytes,
          filename: `fgas-certificate.${input.stored.key?.split(".").pop() ?? "pdf"}`,
          contentType: input.contentType,
        },
    buildAuditCaption({
      approved: input.approved,
      name: input.name,
      email: input.email,
      userId: input.userId,
      companyName: input.verdict?.extractedData.companyName ?? null,
      certificateNumber: input.verdict?.extractedData.certificateNumber ?? null,
      expiryDate: input.verdict?.extractedData.expiryDate ?? null,
      reason: input.reason,
    }),
    `F-Gas ${input.approved ? "approval" : "refusal"} for ${input.email ?? input.userId}`
  );

  if (!result.ok && input.approved) {
    console.error(
      `[fgas] AUDIT GAP: ${input.email ?? input.userId} was auto-approved but the admin copy did not send (${result.detail}). ` +
        `The document is stored at ${input.stored.url}.`
    );
  }
}

export async function POST(request: Request) {
  // Cheap pre-check: refuse an oversized body before buffering it. The real
  // enforcement is on file.size below — this only spares the server the read.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > FGAS_MAX_BYTES * 1.1) {
    return fail("TOO_LARGE", `The file must be smaller than ${FGAS_MAX_MB} MB.`);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("NO_FILE", "The upload could not be read. Attach the certificate and try again.");
  }

  const file = formData.get("certificate");
  if (!(file instanceof File) || file.size === 0) {
    return fail("NO_FILE", "No document was attached to the request.");
  }

  // Client-side checks are a convenience, not a control: everything the
  // browser asserted about this file is re-checked here.
  if (!isAcceptedFgasFile(file)) {
    return fail("UNSUPPORTED_TYPE", "Only PDF, JPG, PNG or WebP files are accepted.");
  }
  if (file.size > FGAS_MAX_BYTES) {
    return fail("TOO_LARGE", `The file must be smaller than ${FGAS_MAX_MB} MB.`);
  }

  // Fail before spending an API call on a document that cannot be audited.
  if (!isVisionConfigured()) {
    console.error(
      "verify-fgas: OPENAI_API_KEY is not set — F-Gas verification is disabled. Add it to the server environment (.env.local) and restart."
    );
    return fail(
      "AI_UNCONFIGURED",
      "Certificate verification is not configured on the server: OPENAI_API_KEY is missing."
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The declared type is attacker-controlled; the magic bytes are not.
  if (!bytesMatchDeclaredType(bytes, file.type)) {
    return fail("CORRUPT_FILE", "This file is not a readable PDF or image. Export the certificate again and re-upload.");
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const submittedAt = new Date().toISOString();

  const analysis = await analyzeCertificate(bytes, file.type as FgasMediaType);

  // These three are not decisions — nothing was judged, so nothing is
  // recorded against the account and nothing is worth auditing.
  switch (analysis.status) {
    case "unconfigured":
      return fail("AI_UNCONFIGURED", "Certificate verification is not configured on the server: OPENAI_API_KEY is missing.");
    case "timeout":
      return fail("AI_TIMEOUT", `The document check exceeded its ${AI_TIMEOUT_MS / 1000} second limit.`);
    case "error":
      return fail("AI_ERROR", "The document checking service is unavailable right now.");
  }

  // A guest has no account to grant or refuse — hand back the reading and
  // stop. Nothing is stored and nothing goes to the admin chat: an
  // unauthenticated upload must not be able to push files into it.
  if (!userId) {
    if (analysis.status === "rejected") return fail("REJECTED", analysis.reason);
    return Response.json(
      { verified: false, status: "GUEST", extracted: analysis.extraction, submittedAt } satisfies VerifyFgasResponse,
      { status: 200 }
    );
  }

  const approved = analysis.status === "verified";
  const verdict = analysis.verdict;
  const extraction = approved ? analysis.extraction : partialExtraction(verdict);
  const reason = approved ? (verdict?.reason?.trim() || null) : analysis.reason;

  // Store the document BEFORE touching the account: a decision pointing at a
  // document nobody can open cannot be reviewed or overturned.
  let stored: StoredCertificate;
  try {
    stored = await storeCertificate(bytes, file.type as FgasMediaType);
  } catch (error) {
    console.error("verify-fgas: certificate upload failed:", error);
    return fail("FAILED", "The certificate could not be stored. Please try again.");
  }

  try {
    await recordDecision(userId, {
      status: approved ? "VERIFIED" : "REJECTED",
      extraction,
      reason,
      documentUrl: stored.url,
      submittedAt,
    });
  } catch (error) {
    console.error("verify-fgas: database commit failed:", error);
    return fail("FAILED", "The certificate was read but could not be saved. Please try again.");
  }

  // Awaited, not fired and forgotten: a promise left dangling when the
  // response returns may simply be killed on a serverless host, and this is
  // the record of the decision.
  const buyer = await prisma.user
    .findUnique({ where: { id: userId }, select: { name: true, email: true } })
    .catch(() => null);

  await sendAuditCopy({
    verdict,
    approved,
    reason,
    stored,
    bytes,
    contentType: file.type,
    userId,
    email: buyer?.email ?? null,
    name: buyer?.name ?? null,
  });

  if (!approved) return fail("REJECTED", analysis.reason);

  return Response.json(
    {
      verified: true,
      status: "VERIFIED",
      extracted: analysis.extraction,
      submittedAt,
    } satisfies VerifyFgasResponse,
    { status: 200 }
  );
}
