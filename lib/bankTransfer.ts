/**
 * Where a B2B wire transfer is sent, and who it is sent to.
 *
 * None of this is secret — it is printed on every invoice — so it lives in
 * the repo rather than in the environment, and the page resolves it on the
 * server and passes it down as props.
 *
 * Each field can still be overridden per deployment. If the account ever
 * changes, prefer setting the environment variable over editing this file:
 * a payment destination is exactly the kind of value worth being able to
 * change (and review) without a code deploy.
 */

export interface BankTransferDetails {
  /** Legal entity receiving the funds. */
  beneficiary: string;
  /** Company registration / VAT number. */
  registrationNumber: string;
  /** Registered address of the beneficiary. */
  beneficiaryAddress: string;
  /** Where to write with a payment query. */
  contactEmail: string;

  bank: string;
  bankAddress: string;
  /** Canonical IBAN — no spaces. Use `formatIban` to display it. */
  iban: string;
  /** SWIFT/BIC. Null hides the row rather than showing a made-up code. */
  bic: string | null;
}

export function bankTransferDetails(): BankTransferDetails {
  return {
    beneficiary: process.env.BANK_BENEFICIARY?.trim() || "My Energy House LTD",
    registrationNumber: process.env.BANK_REGISTRATION_NUMBER?.trim() || "202561920",
    beneficiaryAddress:
      process.env.BANK_BENEFICIARY_ADDRESS?.trim() || "Sofia, G. S. Rakovski St. 18, Bulgaria",
    contactEmail: process.env.BANK_CONTACT_EMAIL?.trim() || "business@energyhouse.cc",

    bank: process.env.BANK_NAME?.trim() || "UniCredit Bulbank",
    bankAddress: process.env.BANK_ADDRESS?.trim() || "Sveta Nedelja Sq. 7, Sofia 1000, Bulgaria",
    iban: normalizeIban(process.env.BANK_IBAN?.trim() || "BG29UNCR70001525622047"),
    bic: process.env.BANK_BIC?.trim() || "UNCRBGSF",
  };
}

/** Strips spacing so the stored/copied value is the canonical form. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Groups an IBAN into fours for display — the convention everywhere from
 * bank statements to invoices, and far easier to check against a screen.
 * Copying still yields the canonical value.
 */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}
