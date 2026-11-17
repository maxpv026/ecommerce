"use client";

import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";

/**
 * Browser side of Face ID / Touch ID (lib/passkeys is the server side).
 * Both ceremonies resolve to a plain result — `cancelled` when the person
 * dismissed the system sheet (NotAllowedError, which is also what a timeout
 * raises), so the UI can say "cancelled" instead of "failed".
 */

export const PASSKEY_CODE_PREFIX = "pk:";

export const passkeysSupported = (): boolean => typeof window !== "undefined" && browserSupportsWebAuthn();

/** A built-in authenticator (Face ID, Touch ID, Windows Hello, Android biometrics) is present. */
export async function platformPasskeyAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  return platformAuthenticatorIsAvailable().catch(() => false);
}

const isCancel = (error: unknown) => error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError");

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export type AssertionOutcome = { ok: true; json: string; code: string } | { ok: false; cancelled: boolean };

/** Runs the Face ID / Touch ID prompt for sign-in or step-up. `code` is the `pk:` form the sign-in endpoint takes. */
export async function runPasskeyAssertion(optionsJSON: PublicKeyCredentialRequestOptionsJSON): Promise<AssertionOutcome> {
  try {
    const response = await startAuthentication({ optionsJSON });
    const json = JSON.stringify(response);
    return { ok: true, json, code: `${PASSKEY_CODE_PREFIX}${toBase64Url(json)}` };
  } catch (error) {
    return { ok: false, cancelled: isCancel(error) };
  }
}

export type RegistrationOutcome = { ok: true; response: RegistrationResponseJSON } | { ok: false; cancelled: boolean; duplicate: boolean };

/** Runs the "add Face ID / Touch ID" prompt. */
export async function runPasskeyRegistration(optionsJSON: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationOutcome> {
  try {
    return { ok: true, response: await startRegistration({ optionsJSON }) };
  } catch (error) {
    // excludeCredentials matched: this authenticator is already enrolled.
    const duplicate = error instanceof Error && error.name === "InvalidStateError";
    return { ok: false, cancelled: !duplicate && isCancel(error), duplicate };
  }
}
