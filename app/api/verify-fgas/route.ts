import { after } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  FGAS_MAX_BYTES,
  FGAS_MAX_MB,
  isAcceptedFgasFile,
  type FgasCheck,
  type FgasMediaType,
  type VerifyFgasErrorCode,
  type VerifyFgasEvent,
  type VerifyFgasResponse,
} from "@/lib/fgas";
import { assessReading, bytesMatchDeclaredType, isVisionConfigured, readCertificateDocument } from "@/lib/fgasVision";
import { storeCertificate } from "@/lib/fgasStorage";
import { applySubmission, crossCheck } from "@/lib/fgasLifecycle";
import { sendFgasStatusEmail, telegramVerdict } from "@/lib/fgasNotify";

/**
 * POST /api/verify-fgas — a signed-in buyer uploads their F-Gas certificate.
 *
 *   multipart/form-data   certificate=<PDF | JPG | PNG | WebP, ≤ 5 MB>
 *   ?stream=1             NDJSON: {type:"stage",stage:1..4} as each stage
 *                         STARTS, then {type:"result",result} — the modal's
 *                         progress is the server's, not a timer
 *
 * The four stages:
 *   1  file & security   size, type allowlist, magic bytes, sign-in
 *   2  AI reading        gpt-4o records what the document says and looks
 *                        like; code turns that into itemised checks
 *                        (lib/fgasVision assessReading)
 *   3  cross-checks      holder ↔ account, certificate number already
 *                        active on another company's account; the document
 *                        is stored (Blob, else encrypted PostgreSQL)
 *   4  verdict           any fail → REJECTED, any review → PENDING_REVIEW,
 *                        else VERIFIED; applied with the safe re-upload rule
 *                        and an audit row (lib/fgasLifecycle)
 *
 * After the response: the buyer is emailed and the admin chat gets the
 * document with the verdict.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS: Record<VerifyFgasErrorCode, number> = {
  SIGN_IN_REQUIRED: 401,
  NO_FILE: 400,
  UNSUPPORTED_TYPE: 415,
  TOO_LARGE: 413,
  CORRUPT_FILE: 415,
  AI_UNCONFIGURED: 500,
  AI_TIMEOUT: 504,
  AI_ERROR: 502,
  FAILED: 500,
};

const fail = (code: VerifyFgasErrorCode, errorReason: string | null = null): VerifyFgasResponse => ({ ok: false, code, errorReason });

async function verify(request: Request, stage: (n: 1 | 2 | 3 | 4) => void): Promise<VerifyFgasResponse> {
  stage(1);
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > FGAS_MAX_BYTES * 1.1) return fail("TOO_LARGE", `The file must be smaller than ${FGAS_MAX_MB} MB.`);

  // Sign-in first: a guest has no account to verify, and must not be able
  // to spend model calls or push files anywhere.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) return fail("SIGN_IN_REQUIRED", "Sign in to verify your F-Gas certificate.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("NO_FILE", "The upload could not be read.");
  }
  const file = formData.get("certificate");
  if (!(file instanceof File) || file.size === 0) return fail("NO_FILE", "No document was attached.");
  if (!isAcceptedFgasFile(file)) return fail("UNSUPPORTED_TYPE", "Only PDF, JPG, PNG or WebP files are accepted.");
  if (file.size > FGAS_MAX_BYTES) return fail("TOO_LARGE", `The file must be smaller than ${FGAS_MAX_MB} MB.`);
  if (!isVisionConfigured()) {
    console.error("verify-fgas: OPENAI_API_KEY is not set — F-Gas verification is disabled.");
    return fail("AI_UNCONFIGURED", "Certificate verification is not configured on the server.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytesMatchDeclaredType(bytes, file.type)) return fail("CORRUPT_FILE", "This file is not a readable PDF or image.");
  const mediaType = (file.type === "image/jpg" ? "image/jpeg" : file.type) as FgasMediaType;
  const submittedAt = new Date();

  // ── 2. AI reading ──
  stage(2);
  const read = await readCertificateDocument(bytes, mediaType);
  if (read.status === "unconfigured") return fail("AI_UNCONFIGURED", "Certificate verification is not configured on the server.");
  if (read.status === "timeout") return fail("AI_TIMEOUT", "The document check took too long.");
  if (read.status === "error") return fail("AI_ERROR", "The document checking service is unavailable right now.");
  const assessment = assessReading(read.reading, submittedAt);

  // ── 3. Cross-checks + storage ──
  stage(3);
  // Holder and duplicate checks only mean something for a document that is
  // an F-Gas certificate at all; for a photo they'd just add noise.
  const isCertificate = assessment.checks.find((c) => c.id === "document")?.outcome === "pass";
  const checks: FgasCheck[] = isCertificate ? [...assessment.checks, ...(await crossCheck(userId, assessment.extraction))] : assessment.checks;
  let documentUrl: string;
  try {
    documentUrl = (await storeCertificate(bytes, mediaType, userId)).url;
  } catch (error) {
    console.error("verify-fgas: certificate could not be stored anywhere:", error);
    return fail("FAILED", "The certificate could not be stored. Please try again.");
  }

  // ── 4. Verdict ──
  stage(4);
  let outcome;
  try {
    outcome = await applySubmission({
      userId,
      extraction: isCertificate ? assessment.extraction : null,
      checks,
      documentUrl,
      submittedAt,
      modelReason: assessment.modelReason,
    });
  } catch (error) {
    console.error("verify-fgas: database commit failed:", error);
    return fail("FAILED", "The certificate was read but could not be saved. Please try again.");
  }

  const x = isCertificate ? assessment.extraction : null;
  after(async () => {
    const buyer = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }).catch(() => null);
    await Promise.all([
      telegramVerdict({
        verdict: outcome.verdict,
        keptActive: outcome.keptActive,
        user: buyer ?? { id: userId, name: null, email: null },
        extraction: x,
        checks,
        reason: outcome.reason,
        document: { bytes, contentType: mediaType },
      }),
      sendFgasStatusEmail({
        userId,
        kind: outcome.verdict === "VERIFIED" ? "VERIFIED" : outcome.verdict === "PENDING_REVIEW" ? "PENDING_REVIEW" : outcome.keptActive ? "REPLACEMENT_REJECTED" : "REJECTED",
        reason: outcome.verdict === "VERIFIED" ? null : outcome.reason,
        reasonCheck: outcome.verdict === "VERIFIED" ? null : outcome.primary,
        certificate: x ? { number: x.certificateId, holder: x.companyName ?? x.personName ?? null, expiresAt: x.expiresAt, issuingBody: x.issuingBody } : null,
      }),
    ]);
  });

  return {
    ok: true,
    verdict: outcome.verdict,
    accountStatus: outcome.accountStatus,
    keptActive: outcome.keptActive,
    extracted: x,
    checks,
    reason: outcome.reason,
    submittedAt: submittedAt.toISOString(),
  };
}

export async function POST(request: Request) {
  const streaming = new URL(request.url).searchParams.get("stream") === "1";

  if (!streaming) {
    const result = await verify(request, () => {});
    return Response.json(result, { status: result.ok ? 200 : STATUS[result.code], headers: { "Cache-Control": "no-store" } });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: VerifyFgasEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await verify(request, (stage) => send({ type: "stage", stage }));
        send({ type: "result", result });
      } catch (error) {
        console.error("verify-fgas: unexpected failure:", error);
        send({ type: "result", result: fail("FAILED", "Something went wrong. Please try again.") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
