import "server-only";

import QRCode from "qrcode";
import { normalizeIban, type BankTransferDetails } from "@/lib/bankTransfer";

/**
 * The EPC QR code ("SEPA QR", European Payments Council EPC069-12): a bank
 * app that scans it pre-fills the beneficiary, IBAN, EUR amount and the
 * remittance text, so the buyer types nothing.
 *
 * Payload, one field per line (version 002, UTF-8):
 *   BCD · 002 · 1 · SCT · BIC · name (≤ 70) · IBAN · EUR<amount> ·
 *   purpose (empty) · structured reference (empty) · remittance text (≤ 140)
 * The order number goes in the unstructured remittance line — the same
 * reference the page tells the buyer to quote. Error correction M, as the
 * standard requires.
 */

export function epcPayload(bank: Pick<BankTransferDetails, "bic" | "beneficiary" | "iban">, amountEur: number, reference: string): string | null {
  // The standard allows 0.01–999 999 999.99 EUR; outside that, no code rather than a wrong one.
  if (!(amountEur >= 0.01 && amountEur <= 999_999_999.99)) return null;
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    bank.bic ?? "",
    bank.beneficiary.slice(0, 70),
    normalizeIban(bank.iban),
    `EUR${amountEur.toFixed(2)}`,
    "",
    "",
    reference.slice(0, 140),
  ].join("\n");
}

/** The code as an SVG string (rendered on the server; the browser draws nothing). */
export async function epcQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0B1020", light: "#ffffff" } });
}
