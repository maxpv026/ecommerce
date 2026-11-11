"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Check, ExternalLink, X } from "lucide-react";
import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import type { OrderTrackingView } from "@/lib/tracking";

/**
 * Placed → Payment → ADR dispatch → Delivery, across the top of the desktop
 * order page.
 *
 * Every state is read from the order itself — nothing is projected. Payment
 * is its own step because a bank-transfer order sits reserved until the funds
 * clear, and that wait, not the carrier, is usually why nothing has shipped.
 * Dispatch and delivery follow the same signal as the tracking timeline
 * (lib/tracking: live DHL status when there is one, the order status
 * otherwise), so the two views can never disagree.
 */

type StepState = "done" | "current" | "upcoming" | "failed";

interface Step {
  key: string;
  title: string;
  detail: string | null;
  state: StepState;
  href?: string;
}

/** DHL's public tracking page for one shipment. */
const dhlTrackingUrl = (trackingNumber: string) =>
  `https://www.dhl.com/global-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`;

export default function OrderLifecycle({
  status,
  paymentStatus,
  bankTransfer,
  createdAt,
  paidAt,
  estimatedDelivery,
  trackingNumber,
  tracking,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Bank transfer (the default checkout method) rather than card. */
  bankTransfer: boolean;
  createdAt: string;
  paidAt: string | null;
  estimatedDelivery: string;
  trackingNumber: string | null;
  tracking: OrderTrackingView;
}) {
  const t = useTranslations("OrderDetail");
  const format = useFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric" });

  const [, shipped, , delivered] = tracking.steps;
  const isDelivered = status === "DELIVERED" || delivered?.state === "done";
  const isDispatched = isDelivered || status === "IN_TRANSIT" || (shipped !== undefined && shipped.state !== "upcoming");
  const paid = paymentStatus === "PAID";

  const steps: Step[] = [
    { key: "placed", title: t("stepPlaced"), detail: day(createdAt), state: "done" },
    {
      key: "payment",
      title: t("stepPayment"),
      ...(paid
        ? { state: "done" as const, detail: paidAt ? t("paymentPaidOn", { date: day(paidAt) }) : t("paymentPaid") }
        : paymentStatus === "FAILED"
          ? { state: "failed" as const, detail: t("paymentFailed") }
          : { state: "current" as const, detail: bankTransfer ? t("paymentAwaitingTransfer") : t("paymentAwaiting") }),
    },
    {
      key: "dispatch",
      title: t("stepDispatch"),
      ...(isDispatched
        ? {
            state: "done" as const,
            detail: trackingNumber ? t("dispatchShippedTracking", { number: trackingNumber }) : t("dispatchShipped"),
            href: trackingNumber ? dhlTrackingUrl(trackingNumber) : undefined,
          }
        : paid
          ? { state: "current" as const, detail: t("dispatchPacking") }
          : { state: "upcoming" as const, detail: t("dispatchAfterPayment") }),
    },
    isDelivered
      ? { key: "delivery", title: t("stepDelivered"), detail: delivered?.timestamp ? day(delivered.timestamp) : null, state: "done" }
      : { key: "delivery", title: t("stepEstimatedDelivery"), detail: day(estimatedDelivery), state: isDispatched ? "current" : "upcoming" },
  ];

  return (
    <nav
      aria-label={t("lifecycleLabel")}
      data-order-lifecycle
      className="rounded-[20px] border border-slate-900/[.07] bg-white/60 px-6 py-5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]"
    >
      <ol className="m-0 grid list-none grid-cols-4 p-0">
        {steps.map((step, i) => {
          const next = steps[i + 1];
          // The connector into the next step is "filled" once that step has
          // been reached, so the line reads as progress, not decoration.
          const filled = next && next.state !== "upcoming";
          return (
            <li key={step.key} data-step={step.key} data-state={step.state} className="relative min-w-0 pr-4">
              {next && (
                <span
                  aria-hidden
                  className={`absolute left-9 right-3 top-[13px] h-[2px] rounded-full ${
                    filled ? "bg-blue-600 dark:bg-blue-500" : "bg-slate-900/[.08] dark:bg-white/[.1]"
                  }`}
                />
              )}
              <span
                className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                  step.state === "done"
                    ? "bg-blue-600 text-white dark:bg-blue-500"
                    : step.state === "current"
                      ? "bg-amber-500/15 text-amber-700 ring-2 ring-amber-500/60 dark:text-amber-300"
                      : step.state === "failed"
                        ? "bg-red-500/15 text-red-600 ring-2 ring-red-500/60 dark:text-red-400"
                        : "bg-slate-900/[.06] text-slate-400 dark:bg-white/[.07] dark:text-slate-500"
                }`}
              >
                {step.state === "done" ? (
                  <Check size={14} strokeWidth={3} />
                ) : step.state === "failed" ? (
                  <X size={14} strokeWidth={3} />
                ) : step.state === "current" ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                ) : (
                  i + 1
                )}
              </span>
              <div
                className={`mt-3 text-[13px] font-semibold tracking-[-.015em] ${
                  step.state === "upcoming" ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {step.title}
              </div>
              {step.detail &&
                (step.href ? (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {step.detail}
                    <ExternalLink size={11} strokeWidth={2.2} />
                  </a>
                ) : (
                  <div
                    className={`mt-0.5 text-[12px] ${
                      step.state === "current"
                        ? "font-medium text-amber-700 dark:text-amber-300"
                        : step.state === "failed"
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {step.detail}
                  </div>
                ))}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
