"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Check, ClipboardCopy, Copy, Download, Loader2, MapPin, Phone, QrCode, Send } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EYEBROW, MicroBadge, PILL, PRIMARY, SECONDARY, SUMMARY_CARD, SURFACE, safetyTone } from "@/components/home/ui";
import { formatIban, type BankTransferDetails } from "@/lib/bankTransfer";
import { reportPaymentSent } from "@/lib/actions/checkout";
import { usePackLabel } from "@/lib/hooks/usePackLabel";
import type { OrderBreakdown } from "@/lib/orderTotals";

/**
 * /checkout/success — step 3: the bank-transfer terminal. Header with the
 * accountant's actions (invoice PDF, copy everything, the order), then 8 + 4:
 * reference and exact amount, the requisites each with its own copy button,
 * the EPC SEPA QR code, and "I've sent it" — beside the order, its
 * breakdown and delivery. Every figure is the stored order's (the invoice
 * prints the same, via orderBreakdown).
 */

export interface PlacedOrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string;
  estimatedDelivery: string;
  shippingAddress: string | null;
  phone: string | null;
  customerNote: string | null;
  paid: boolean;
  reported: { at: string; reference: string | null } | null;
  invoice: { id: string; number: string } | null;
  breakdown: OrderBreakdown;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; weightKg: number; containerType: string | null; pricedPerKg: boolean; safety: string | null }>;
}

interface Props {
  order: PlacedOrderSummary;
  bank: BankTransferDetails;
  /** EPC QR (payload + server-rendered SVG); null when the amount is outside the standard's range. */
  qr: { payload: string; svg: string } | null;
}

const LABEL = "text-[11.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-ink-muted";
const MONO = "font-mono tabular-nums tracking-[-.01em]";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      // Clipboard blocked: the value is on screen and selectable either way.
    }
  };
  return { copied, copy };
}

function CopyChip({ id, value, label, done, copy, copied }: { id: string; value: string; label: string; done: string; copy: (k: string, v: string) => void; copied: string | null }) {
  const on = copied === id;
  return (
    <button
      type="button"
      onClick={() => copy(id, value)}
      data-copy={id}
      data-copied={on ? "1" : undefined}
      className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]"}`}
    >
      {on ? <Check size={12} strokeWidth={3} /> : <Copy size={12} strokeWidth={2.2} />}
      {on ? done : label}
    </button>
  );
}

export default function CheckoutSuccessPage({ order, bank, qr }: Props) {
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const packLabel = usePackLabel();
  const { copied, copy } = useCopy();
  const [ibanSpaces, setIbanSpaces] = useState(true);
  const [reported, setReported] = useState(order.reported);
  const [bankRef, setBankRef] = useState("");
  const [reportError, setReportError] = useState(false);
  const [reporting, startReport] = useTransition();

  const b = order.breakdown;
  const eur = (v: number) => format.number(v, { style: "currency", currency: "EUR" });
  const amountPlain = b.total.toFixed(2);
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const ibanShown = ibanSpaces ? formatIban(bank.iban) : bank.iban;
  const invoiceHref = order.invoice ? `/api/invoices/${order.invoice.id}/download` : null;

  // One block an accountant can paste into a payment order or an email.
  const allText = [
    `${t("payBeneficiary")}: ${bank.beneficiary}`,
    `IBAN: ${bank.iban}`,
    ...(bank.bic ? [`BIC / SWIFT: ${bank.bic}`] : []),
    `${t("payBank")}: ${bank.bank}, ${bank.bankAddress}`,
    `${t("payAmount")}: ${amountPlain} EUR`,
    `${t("payReference")}: ${order.orderNumber}`,
    `${t("payVatNumber")}: ${bank.registrationNumber}`,
  ].join("\n");

  const report = () =>
    startReport(async () => {
      setReportError(false);
      const r = await reportPaymentSent({ orderId: order.id, reference: bankRef });
      if (r.ok) setReported({ at: r.reportedAt, reference: r.reference });
      else setReportError(true);
    });

  const status = [
    { k: "placed", state: "done" as const },
    { k: "awaiting", state: order.paid ? ("done" as const) : ("current" as const) },
    { k: "packing", state: order.paid ? ("current" as const) : ("next" as const) },
    { k: "shipped", state: "next" as const },
  ];

  return (
    <div className="relative overflow-x-clip">
      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-checkout-success>
        {/* ── Header bar: status + title left, the accountant's actions right ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-success-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("payTitle")}</h1>
            <p className="m-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-success-meta>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300" data-status-pill>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {order.paid ? t("statusPaid") : t("statusReserved")}
              </span>
              <span data-order-number>{t("payMeta", { number: order.orderNumber, date: day(order.estimatedDelivery) })}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:flex-none lg:pt-1">
            {invoiceHref && (
              <a href={invoiceHref} download className="inline-flex min-h-[38px] items-center gap-2 rounded-full bg-blue-700 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-800" data-invoice-download="header">
                <Download size={14} strokeWidth={2.2} />
                {t("actionInvoice")}
              </a>
            )}
            <button type="button" onClick={() => copy("all", allText)} className={PILL} data-copy="all" data-copied={copied === "all" ? "1" : undefined}>
              {copied === "all" ? <Check size={14} strokeWidth={2.6} className="text-emerald-600" /> : <ClipboardCopy size={14} strokeWidth={2.2} />}
              {copied === "all" ? t("copiedAll") : t("actionCopyAll")}
            </button>
            <Link href={`/profile/orders/${order.id}`} className="inline-flex min-h-[38px] items-center gap-1 px-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" data-view-order>
              {t("actionHistory")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* ── Left: the transfer terminal ── */}
          <section className={`min-w-0 lg:col-span-8 ${SURFACE}`} data-bank-terminal>
            {/* Reference + exact amount */}
            <div className="grid gap-px bg-slate-900/[.06] sm:grid-cols-2 dark:bg-white/[.06]">
              <div className="bg-blue-600/[.05] px-5 py-4 dark:bg-blue-400/[.07]" data-payment-reference>
                <p className={`m-0 ${LABEL}`}>{t("refLabel")}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-[20px] font-semibold ${MONO}`} data-reference-value>{order.orderNumber}</span>
                  <CopyChip id="reference" value={order.orderNumber} label={t("copy")} done={t("copied")} copy={copy} copied={copied} />
                </div>
                <p className="m-0 mt-2 text-[12px] leading-[1.5] text-slate-600 dark:text-slate-300">{t("refHint")}</p>
              </div>
              <div className="bg-white/80 px-5 py-4 dark:bg-white/[.02]" data-payment-amount>
                <p className={`m-0 ${LABEL}`}>{t("amountLabel")}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-[20px] font-semibold ${MONO}`} data-amount-value>{eur(b.total)}</span>
                  <CopyChip id="amount" value={amountPlain} label={t("copyAmount")} done={t("copied")} copy={copy} copied={copied} />
                </div>
                <p className="m-0 mt-2 text-[12px] leading-[1.5] text-slate-600 dark:text-slate-300">{t("amountHint")}</p>
              </div>
            </div>

            {/* Requisites + QR */}
            <div className="grid gap-6 px-5 py-5 md:grid-cols-[minmax(0,1fr)_220px]">
              <dl className="m-0 flex min-w-0 flex-col divide-y divide-slate-900/[.06] dark:divide-white/[.06]" data-requisites>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3" data-bank-row="beneficiary">
                  <div className="min-w-0">
                    <dt className={LABEL}>{t("payBeneficiary")}</dt>
                    <dd className="m-0 mt-1 text-[14px] font-semibold">{bank.beneficiary}</dd>
                  </div>
                  <CopyChip id="beneficiary" value={bank.beneficiary} label={t("copy")} done={t("copied")} copy={copy} copied={copied} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-3" data-bank-row="iban">
                  <div className="min-w-0">
                    <dt className={LABEL}>{t("ibanLabel")}</dt>
                    <dd className={`m-0 mt-1 break-all text-[15px] font-semibold ${MONO}`} data-iban-value>{ibanShown}</dd>
                    <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-ink-muted">
                      <input type="checkbox" checked={!ibanSpaces} onChange={(e) => setIbanSpaces(!e.target.checked)} className="h-3.5 w-3.5 accent-blue-700" data-iban-nospaces />
                      {t("ibanNoSpaces")}
                    </label>
                  </div>
                  <CopyChip id="iban" value={ibanSpaces ? formatIban(bank.iban) : bank.iban} label={t("copyIban")} done={t("copied")} copy={copy} copied={copied} />
                </div>
                {bank.bic && (
                  <div className="flex flex-wrap items-center justify-between gap-2 py-3" data-bank-row="bic">
                    <div className="min-w-0">
                      <dt className={LABEL}>BIC / SWIFT</dt>
                      <dd className={`m-0 mt-1 text-[15px] font-semibold ${MONO}`}>{bank.bic}</dd>
                    </div>
                    <CopyChip id="bic" value={bank.bic} label={t("copy")} done={t("copied")} copy={copy} copied={copied} />
                  </div>
                )}
                <div className="py-3" data-bank-row="bank">
                  <dt className={LABEL}>{t("payBank")}</dt>
                  <dd className="m-0 mt-1 text-[13.5px]">
                    <span className="font-semibold">{bank.bank}</span>
                    <span className="block text-[12.5px] text-slate-500 dark:text-ink-muted">{bank.bankAddress}</span>
                  </dd>
                </div>
                <div className="py-3" data-bank-row="registration">
                  <dt className={LABEL}>{t("payVatNumber")}</dt>
                  <dd className="m-0 mt-1 text-[13.5px]">
                    <span className={`font-semibold ${MONO}`}>{bank.registrationNumber}</span>
                    <span className="block text-[12.5px] text-slate-500 dark:text-ink-muted">{bank.beneficiaryAddress}</span>
                  </dd>
                </div>
                <div className="pt-3" data-bank-row="type">
                  <dt className={LABEL}>{t("transferTypeLabel")}</dt>
                  <dd className="m-0 mt-1 text-[13.5px] font-semibold">{t("transferType")}</dd>
                </div>
              </dl>

              {qr && (
                <div className="flex flex-col items-center rounded-[18px] border border-slate-900/[.08] bg-white p-4 text-center dark:border-white/[.1]" data-epc-qr data-epc-payload={qr.payload}>
                  <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800">
                    <QrCode size={14} strokeWidth={2.2} />
                    {t("qrTitle")}
                  </p>
                  {/* Server-rendered by `qrcode` from the EPC payload above (lib/epcQr). */}
                  <div className="mt-3 h-[172px] w-[172px] [&>svg]:h-full [&>svg]:w-full" aria-label={t("qrAria", { number: order.orderNumber })} role="img" dangerouslySetInnerHTML={{ __html: qr.svg }} />
                  <p className="m-0 mt-3 text-[11.5px] leading-[1.45] text-slate-500">{t("qrHint")}</p>
                </div>
              )}
            </div>

            {/* "I've sent it" */}
            <div className="border-t border-slate-900/[.06] bg-slate-50/70 px-5 py-4 dark:border-white/[.06] dark:bg-white/[.02]" data-payment-report={order.paid ? "paid" : reported ? "reported" : "open"}>
              {order.paid ? (
                <p className="m-0 flex items-center gap-2 text-[13.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <Check size={15} strokeWidth={2.6} />
                  {t("reportPaid")}
                </p>
              ) : reported ? (
                <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-300" role="status">
                  <Check size={16} strokeWidth={2.6} className="mt-0.5 flex-none" />
                  <div>
                    <p className="m-0 text-[13.5px] font-semibold">{t("reportDone")}</p>
                    <p className="m-0 mt-0.5 text-[12px] text-slate-500 dark:text-ink-muted">
                      {t("reportDoneAt", { time: format.dateTime(new Date(reported.at), { dateStyle: "medium", timeStyle: "short" }) })}
                      {reported.reference ? ` · ${t("reportRefShown", { ref: reported.reference })}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="m-0 min-w-[200px] flex-1 text-[13.5px] font-semibold">{t("reportQuestion")}</p>
                  <input value={bankRef} onChange={(e) => setBankRef(e.target.value.slice(0, 80))} placeholder={t("reportRefPlaceholder")} className="h-9 w-full rounded-full border border-slate-900/[.12] bg-white px-3.5 text-[12.5px] focus:border-blue-600/50 focus:outline-none sm:w-[220px] dark:border-white/[.14] dark:bg-white/[.04]" data-report-ref />
                  <button type="button" onClick={report} disabled={reporting} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0B1020] px-4 text-[12.5px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900" data-report-sent>
                    {reporting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={2.2} />}
                    {t("reportCta")}
                  </button>
                  {reportError && <span className="w-full text-[12px] font-semibold text-red-600 dark:text-red-400">{t("reportError")}</span>}
                </div>
              )}
            </div>
          </section>

          {/* ── Right: the order, its breakdown, delivery ── */}
          <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-success-summary>
            <div className={SUMMARY_CARD}>
              <h2 className={EYEBROW}>{t("summaryEyebrow")}</h2>
              <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-slate-900/[.06] p-0 dark:divide-white/[.06]" data-success-items>
                {order.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-2.5" data-success-item>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13.5px] font-semibold">{i.name}</p>
                      <p className="m-0 mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500 dark:text-ink-muted">
                        <span data-line-pack>{packLabel(i.weightKg, i.containerType, i.pricedPerKg)}</span>
                        <span>× {i.quantity}</span>
                        {i.safety && <MicroBadge tone={safetyTone(i.safety)}>{i.safety}</MicroBadge>}
                      </p>
                    </div>
                    <span className="flex-none text-[13.5px] font-semibold tabular-nums">{eur(i.unitPrice * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <dl className="m-0 mt-2 flex flex-col gap-2 border-t border-slate-900/[.08] pt-3 text-[13px] dark:border-white/[.08]" data-success-breakdown>
                {[
                  { k: "subtotal", label: tCart("subtotal"), v: b.subtotal },
                  ...(b.deposit > 0 ? [{ k: "deposit", label: tCart("cylinderDeposit"), v: b.deposit }] : []),
                  { k: "shipping", label: tCart("estimatedShipping"), v: b.shipping },
                  { k: "vat", label: tCart("vat20"), v: b.vat },
                ].map((r) => (
                  <div key={r.k} className="flex items-baseline justify-between gap-3" data-breakdown={r.k}>
                    <dt className="text-slate-600 dark:text-ink-muted">{r.label}</dt>
                    <dd className="m-0 font-semibold tabular-nums">{eur(r.v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-900/[.08] pt-3 dark:border-white/[.08]">
                <span className="text-[15px] font-semibold">{tCart("total")}</span>
                <span className="text-[26px] font-semibold tracking-[-.04em] tabular-nums" data-success-total>{eur(b.total)}</span>
              </div>

              {order.shippingAddress && (
                <div className="mt-4 border-t border-slate-900/[.08] pt-3.5 dark:border-white/[.08]" data-success-address>
                  <p className={`m-0 ${LABEL} flex items-center gap-1.5`}>
                    <MapPin size={12} strokeWidth={2.2} />
                    {t("shipTo")}
                  </p>
                  <p className="m-0 mt-1.5 whitespace-pre-line text-[13px] leading-[1.55]">{order.shippingAddress}</p>
                  {/* The frozen address usually carries the phone already ("Tel: …"); show it only when it doesn't. */}
                  {order.phone && !order.shippingAddress.replace(/\s/g, "").includes(order.phone.replace(/\s/g, "")) && (
                    <p className="m-0 mt-1 flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                      <Phone size={12} strokeWidth={2.2} />
                      {order.phone}
                    </p>
                  )}
                  {order.customerNote && (
                    <p className="m-0 mt-1.5 rounded-[12px] bg-slate-900/[.04] px-3 py-2 text-[12.5px] dark:bg-white/[.05]" data-success-note>
                      {t("noteShown", { note: order.customerNote })}
                    </p>
                  )}
                </div>
              )}

              <ol className="m-0 mt-4 flex list-none flex-col gap-2 border-t border-slate-900/[.08] p-0 pt-3.5 dark:border-white/[.08]" data-order-status>
                {status.map((s) => (
                  <li key={s.k} className="flex items-center gap-2.5 text-[12.5px]" data-status-step={s.k} data-state={s.state}>
                    <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full ${s.state === "done" ? "bg-emerald-500 text-white" : s.state === "current" ? "border-2 border-blue-600 dark:border-blue-400" : "border border-slate-300 dark:border-white/20"}`}>
                      {s.state === "done" && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className={s.state === "next" ? "text-slate-400 dark:text-ink-muted" : "font-semibold"}>{t(`status_${s.k}`)}</span>
                  </li>
                ))}
              </ol>

              {invoiceHref && (
                <a href={invoiceHref} download className={`${PRIMARY} mt-5`} data-invoice-download="card">
                  {t("cardInvoice")}
                  <ArrowRight size={16} strokeWidth={2.2} />
                </a>
              )}
              <Link href="/profile?tab=orders" className={`${SECONDARY} mt-2`} data-my-orders>
                {t("cardOrders")}
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
