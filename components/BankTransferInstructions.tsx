"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Check, Copy, Landmark } from "lucide-react";
import { formatIban, type BankTransferDetails } from "@/lib/bankTransfer";

/**
 * Where to send the money.
 *
 * Shown on the confirmation right after an order is placed, and again on the
 * order page for as long as it is awaiting payment — a wire transfer is made
 * later, from a bank's own app, so the buyer will come back looking for these
 * numbers rather than copying them once and being done.
 *
 * The reference is given its own block at the top rather than a row in the
 * table: without the order number on the transfer, the money arrives with
 * nothing tying it to a basket, and that is the single most common way a B2B
 * payment goes astray.
 */

interface BankTransferInstructionsProps {
  details: BankTransferDetails;
  /** The order number the buyer must quote — the payment reference. */
  reference: string;
  /** Pre-formatted total, so the caller owns the locale and currency. */
  amount: string;
  className?: string;
}

/** Muted label, stark value — the Tech-Luxury pairing used across the app. */
const LABEL = "text-[11px] tracking-[.07em] text-slate-500 dark:text-slate-400";
const VALUE = "text-[13.5px] font-semibold tracking-[-.015em] text-slate-900 dark:text-white";

/**
 * Declared at module scope, not inside the component: a component created
 * during render is a new type on every pass and loses its state.
 */
function CopyButton({
  target,
  value,
  label,
  copied,
  onCopy,
  copyLabel,
}: {
  target: string;
  value: string;
  label: string;
  copied: string | null;
  onCopy: (key: string, value: string) => void;
  copyLabel: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={() => onCopy(target, value)}
      aria-label={`${copyLabel} ${label}`}
      data-copy={target}
      // The tappable area is 44×44 (the iOS minimum); the visible chrome
      // stays the 28px square the desktop design uses. The negative margin
      // is vertical only — pulling it sideways too pushed the button past
      // the right edge of its flex row by exactly the 8px it borrowed.
      className="group -my-2 flex min-h-[44px] min-w-[44px] flex-none items-center justify-center sm:-my-1.5"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-slate-200 text-slate-500 transition-colors group-hover:border-cyan-500/40 group-hover:bg-cyan-500/[.06] group-hover:text-cyan-700 dark:border-white/10 dark:text-slate-400 dark:group-hover:border-cyan-400/35 dark:group-hover:text-cyan-300">
        {copied === target ? (
          <Check size={13} strokeWidth={2.6} className="text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy size={13} strokeWidth={2.2} />
        )}
      </span>
    </motion.button>
  );
}

function Row({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div
      data-bank-row={name}
      // Stacked below sm. Side by side, an IBAN or a bank address competes
      // with its own label for ~200px and either truncates to uselessness
      // or forces the card wider than the screen.
      className="flex flex-col gap-1 border-t border-slate-200 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 dark:border-white/10"
    >
      <dt className={`${LABEL} flex-none sm:pt-px`}>{label.toUpperCase()}</dt>
      <dd className="m-0 flex min-w-0 items-center gap-2 sm:justify-end">{children}</dd>
    </div>
  );
}

export default function BankTransferInstructions({
  details,
  reference,
  amount,
  className = "",
}: BankTransferInstructionsProps) {
  const t = useTranslations("Checkout");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      // Clipboard blocked (insecure origin, denied permission). The value is
      // on screen and selectable either way, so this isn't worth a toast.
    }
  };

  return (
    <section
      data-bank-instructions
      className={`relative overflow-hidden rounded-[26px] border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-md sm:p-6 backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/80 dark:shadow-none ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-[18%] -top-[42%] h-[320px] w-[320px] rounded-full opacity-[.14] blur-[80px] dark:opacity-[.2]"
        style={{ background: "radial-gradient(circle,#0891b2,transparent 68%)" }}
      />

      <div className="relative">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#0891b2,#1d4ed8)] text-white shadow-[0_12px_26px_-14px_rgba(8,145,178,.9)]">
            <Landmark size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
              {t("payInstructionsTitle")}
            </h2>
            <p className="mb-0 mt-1 text-[12.5px] leading-[1.55] text-slate-500 dark:text-slate-400">
              {t("payInstructionsBody")}
            </p>
          </div>
        </div>

        {/* ── The reference. Given its own block because a transfer that
               arrives without it cannot be matched to this order. ── */}
        <div
          data-payment-reference
          className="mb-5 rounded-[18px] border border-cyan-500/30 bg-cyan-500/[.07] px-4 py-3.5 dark:border-cyan-400/25 dark:bg-cyan-400/[.06]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={`${LABEL} mb-1`}>{t("payReference").toUpperCase()}</div>
              <div
                data-reference-value
                className="break-all text-[16px] font-semibold tracking-[-.02em] text-slate-900 tabular-nums dark:text-white"
              >
                {t("payReferenceValue", { number: reference })}
              </div>
            </div>
            <CopyButton
              target="reference"
              value={reference}
              label={t("payReference")}
              copied={copied}
              onCopy={copy}
              copyLabel={t("payCopy")}
            />
          </div>
          <p className="mb-0 mt-2 text-[11.5px] leading-[1.5] text-slate-600 dark:text-slate-400">
            {t("payReferenceHint", { reference })}
          </p>
        </div>

        {/* ── Bank ── */}
        <dl className="m-0 flex flex-col">
          <Row name="amount" label={t("payAmount")}>
            <span className="text-[15px] font-semibold tracking-[-.02em] text-slate-900 tabular-nums dark:text-white">
              {amount}
            </span>
          </Row>

          <Row name="bank" label={t("payBank")}>
            <span className={`text-left sm:text-right ${VALUE}`}>{details.bank}</span>
          </Row>

          <Row name="iban" label={t("payIban")}>
            <span className={`min-w-0 break-all text-left sm:text-right ${VALUE} tabular-nums`}>{formatIban(details.iban)}</span>
            <CopyButton
              target="iban"
              value={details.iban}
              label={t("payIban")}
              copied={copied}
              onCopy={copy}
              copyLabel={t("payCopy")}
            />
          </Row>

          {details.bic && (
            <Row name="bic" label={t("payBic")}>
              <span className={`text-left sm:text-right ${VALUE} tabular-nums`}>{details.bic}</span>
              <CopyButton
                target="bic"
                value={details.bic}
                label={t("payBic")}
                copied={copied}
                onCopy={copy}
                copyLabel={t("payCopy")}
              />
            </Row>
          )}

          <Row name="bankAddress" label={t("payBankAddress")}>
            <span className="text-left text-[12.5px] leading-[1.5] text-slate-700 sm:text-right dark:text-slate-300">
              {details.bankAddress}
            </span>
          </Row>
        </dl>

        {/* ── Beneficiary ── */}
        <div className="mt-5 rounded-[18px] bg-slate-50 p-4 dark:bg-white/[.04]" data-beneficiary-block>
          <div className={`${LABEL} mb-2.5`}>{t("payBeneficiary").toUpperCase()}</div>
          <dl className="m-0 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-4" data-bank-row="beneficiary">
              <dt className="sr-only">{t("payBeneficiary")}</dt>
              <dd className={`m-0 ${VALUE}`}>{details.beneficiary}</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" data-bank-row="registrationNumber">
              <dt className={`${LABEL} flex-none`}>{t("payVatNumber")}</dt>
              <dd className="m-0 text-left text-[12.5px] font-medium text-slate-700 tabular-nums sm:text-right dark:text-slate-300">
                {details.registrationNumber}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" data-bank-row="beneficiaryAddress">
              <dt className={`${LABEL} flex-none`}>{t("payBeneficiaryAddress")}</dt>
              <dd className="m-0 text-left text-[12.5px] leading-[1.5] text-slate-700 sm:text-right dark:text-slate-300">
                {details.beneficiaryAddress}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" data-bank-row="contactEmail">
              <dt className={`${LABEL} flex-none`}>{t("payContactEmail")}</dt>
              <dd className="m-0 text-left text-[12.5px] font-medium break-all sm:text-right">
                <a
                  href={`mailto:${details.contactEmail}`}
                  className="text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300"
                >
                  {details.contactEmail}
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
