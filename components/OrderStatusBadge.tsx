"use client";

import { useTranslations } from "next-intl";
import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";

/**
 * The order's two independent states, as one pill each.
 *
 * Fulfilment and settlement are deliberately separate badges rather than one
 * merged status: these are B2B wire transfers, so an order is routinely
 * PENDING payment long after it has shipped, and collapsing the two would
 * have to lie about one of them.
 *
 * The palette and label keys were duplicated across three screens before
 * this; they live here now so a status can never read "In Transit" on one
 * page and "Shipped" on another.
 */

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING:
    "border-amber-600/20 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400",
  IN_TRANSIT:
    "border-blue-700/20 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-400",
  DELIVERED:
    "border-slate-900/10 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
};

const STATUS_LABEL_KEYS: Record<OrderStatus, string> = {
  PENDING: "statusPending",
  IN_TRANSIT: "statusInTransit",
  DELIVERED: "statusDelivered",
};

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  PAID: "border-green-600/20 bg-green-50 text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-400",
  PENDING:
    "border-amber-600/20 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400",
  FAILED: "border-red-600/20 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-400",
};

const PAYMENT_LABEL_KEYS: Record<PaymentStatus, string> = {
  PAID: "paymentPaid",
  PENDING: "paymentPending",
  FAILED: "paymentFailed",
};

/** 44px-tall touch target on `lg`; `sm` is for dense list rows. */
type BadgeSize = "sm" | "lg";

const SIZES: Record<BadgeSize, string> = {
  sm: "px-2.5 py-1 text-[10.5px]",
  lg: "px-3.5 py-1.5 text-[12px]",
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
  size?: BadgeSize;
  className?: string;
}

export default function OrderStatusBadge({ status, size = "lg", className = "" }: OrderStatusBadgeProps) {
  const t = useTranslations("AccountProfile");
  return (
    <span
      data-order-status={status}
      className={`inline-flex items-center rounded-full border font-semibold tracking-[-.01em] ${SIZES[size]} ${STATUS_STYLES[status]} ${className}`}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  size?: BadgeSize;
  className?: string;
}

export function PaymentStatusBadge({ status, size = "lg", className = "" }: PaymentStatusBadgeProps) {
  const t = useTranslations("Checkout");
  return (
    <span
      data-payment-status={status}
      className={`inline-flex items-center rounded-full border font-semibold tracking-[-.01em] ${SIZES[size]} ${PAYMENT_STYLES[status]} ${className}`}
    >
      {t(PAYMENT_LABEL_KEYS[status])}
    </span>
  );
}
