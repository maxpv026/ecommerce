/**
 * Everything the seller block prints — invoices, compliance reports, safety
 * data sheets, email footers. Env-overridable so staging isn't billed as
 * production, and one letterhead serves every document this shop issues.
 *
 * Its own module (re-exported from lib/pdf) so an email can carry the
 * sender's identity without importing the PDF renderer.
 */
export function sellerDetails() {
  const smtpUser = process.env.SMTP_USER?.trim();
  return {
    name: process.env.INVOICE_SELLER_NAME?.trim() || "My Energy",
    addressLines: (process.env.INVOICE_SELLER_ADDRESS?.trim() || "")
      .split("|")
      .map((l) => l.trim())
      .filter(Boolean),
    vatId: process.env.INVOICE_SELLER_VAT_ID?.trim() || undefined,
    // SMTP_USER only when it is an address: with Resend it is the literal
    // word "resend", which must not be printed on an invoice or SDS.
    email: process.env.INVOICE_SELLER_EMAIL?.trim() || (smtpUser?.includes("@") ? smtpUser : undefined),
  };
}
