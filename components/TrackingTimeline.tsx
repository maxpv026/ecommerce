"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Building2, Check, Copy, ExternalLink, MapPin, Phone, Radio, Truck, UserRound, Warehouse } from "lucide-react";
import { STAGE_LABEL_KEY, STEP_LABEL_KEY, type OrderTrackingView } from "@/lib/tracking";

/**
 * The shipment card on the order page (mobile: first card; desktop: under
 * the line items whenever there is carrier, fleet, pickup or checkpoint
 * detail to show). Any carrier: the stepper and the log come from
 * lib/tracking buildOrderTracking, the strip below the stepper from the
 * order's fulfilment method.
 */

const METHOD_ICON = { DHL: Truck, FREIGHT: Building2, OWN_FLEET: UserRound, PICKUP: Warehouse } as const;

/** A pickup's log uses the stepper's own pickup wording, so the two read the same. */
const PICKUP_STAGE_LABEL: Partial<Record<keyof typeof STAGE_LABEL_KEY, string>> = {
  ORDER_PLACED: "stepPickupPlaced",
  ADR_PACKING: "stepPickupPreparing",
  READY_FOR_PICKUP: "stepPickupReady",
  DELIVERED: "stepPickupCollected",
};

function CopyReference({ value }: { value: string }) {
  const t = useTranslations("Checkout");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      aria-label={t("copyReference")}
      data-copy-reference
      className="inline-flex h-7 items-center gap-1 rounded-[8px] border border-slate-900/[.1] px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-300 dark:hover:bg-white/[.06]"
    >
      {copied ? <Check size={11} strokeWidth={2.6} /> : <Copy size={11} strokeWidth={2.2} />}
      {copied ? t("copied") : t("copyReference")}
    </button>
  );
}

/** Carrier, fleet or pickup details — whichever this order travels by. */
function DispatchStrip({ tracking }: { tracking: OrderTrackingView }) {
  const t = useTranslations("Checkout");
  const format = useFormatter();
  const eta = tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery) : null;
  const delivered = tracking.stage === "DELIVERED";
  const box = "mt-5 rounded-[14px] border border-slate-900/[.08] bg-slate-50/80 p-3.5 dark:border-white/[.08] dark:bg-white/[.03]";
  const dt = "text-[10.5px] font-semibold uppercase tracking-[.07em] text-slate-400 dark:text-slate-500";

  if (tracking.method === "OWN_FLEET" && tracking.fleet) {
    const f = tracking.fleet;
    return (
      <div className={box} data-fleet-card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={dt}>{t("fleetTitle")}</span>
          {f.vehiclePlate && (
            <span className="rounded-[6px] border-2 border-slate-900 bg-white px-2 py-0.5 font-mono text-[13px] font-bold tracking-[.06em] text-slate-900 dark:border-slate-200 dark:bg-slate-900 dark:text-slate-100" data-vehicle-plate>
              {f.vehiclePlate}
            </span>
          )}
        </div>
        <dl className="m-0 mt-2.5 grid grid-cols-1 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-2">
          {f.driverName && (
            <div>
              <dt className={dt}>{t("driverLabel")}</dt>
              <dd className="m-0 mt-0.5 font-semibold" data-driver-name>{f.driverName}</dd>
            </div>
          )}
          {f.driverPhone && (
            <div>
              <dt className={dt}>{t("driverPhoneLabel")}</dt>
              <dd className="m-0 mt-0.5">
                <a href={`tel:${f.driverPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 whitespace-nowrap font-mono font-semibold text-blue-700 hover:underline dark:text-blue-400" data-driver-phone>
                  <Phone size={11} strokeWidth={2.4} /> {f.driverPhone}
                </a>
              </dd>
            </div>
          )}
          {eta && !delivered && (
            <div className="sm:col-span-2">
              <dt className={dt}>{t("fleetEta")}</dt>
              <dd className="m-0 mt-0.5 font-semibold" data-fleet-eta>
                {format.dateTime(eta, { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </dd>
            </div>
          )}
        </dl>
        {tracking.notes && <p className="m-0 mt-2.5 text-[12px] leading-[1.5] text-slate-600 dark:text-slate-300" data-delivery-notes>{tracking.notes}</p>}
      </div>
    );
  }

  if (tracking.method === "PICKUP" && tracking.pickup) {
    const p = tracking.pickup;
    return (
      <div className={box} data-pickup-card>
        <span className={dt}>{t("pickupTitle")}</span>
        <p className="m-0 mt-1.5 whitespace-pre-line text-[13px] font-semibold leading-[1.45]" data-pickup-location>
          {p.location ?? t("pickupPending")}
        </p>
        {p.hours && <p className="m-0 mt-1 text-[12px] text-slate-500 dark:text-slate-400" data-pickup-hours>{t("pickupHours", { hours: p.hours })}</p>}
        {tracking.notes && <p className="m-0 mt-2 whitespace-pre-line text-[12px] leading-[1.5] text-slate-600 dark:text-slate-300" data-delivery-notes>{tracking.notes}</p>}
      </div>
    );
  }

  const c = tracking.carrier;
  if (!c || (!c.trackingNumber && !c.trackingUrl && tracking.method === "DHL" && !tracking.notes)) return null;
  return (
    <div className={box} data-carrier-strip>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <span className="text-slate-500 dark:text-slate-400">{t("carrierLabel")}</span>
        <span className="font-semibold" data-carrier-name>{c.name ?? "—"}</span>
        {c.trackingNumber && (
          <>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-slate-500 dark:text-slate-400">{t("referenceLabel")}</span>
            <span className="font-mono font-semibold tracking-[.02em]" data-carrier-reference>{c.trackingNumber}</span>
          </>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {c.trackingUrl ? (
          <a
            href={c.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-carrier-track
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-blue-600 px-3 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            {t("trackOnCarrier")} <ExternalLink size={11} strokeWidth={2.4} />
          </a>
        ) : (
          !delivered && <span className="text-[11.5px] text-slate-500 dark:text-slate-400" data-carrier-manual>{t("statusByLogistics")}</span>
        )}
        {c.trackingNumber && <CopyReference value={c.trackingNumber} />}
      </div>
      {tracking.notes && <p className="m-0 mt-2.5 text-[12px] leading-[1.5] text-slate-600 dark:text-slate-300" data-delivery-notes>{tracking.notes}</p>}
    </div>
  );
}

interface TrackingTimelineProps {
  tracking: OrderTrackingView;
  trackingNumber: string | null;
  /** Rendered at the foot of the card — the order page puts the delivery address here on mobile. */
  children?: ReactNode;
}

export default function TrackingTimeline({ tracking, trackingNumber, children }: TrackingTimelineProps) {
  const t = useTranslations("Checkout");
  const format = useFormatter();
  const MethodIcon = METHOD_ICON[tracking.method];
  const methodBadge =
    tracking.method === "OWN_FLEET" ? t("methodOwnFleet") : tracking.method === "PICKUP" ? t("methodPickup") : (tracking.carrier?.name ?? t("methodDhl"));

  const stepDate = (ts: string | null) =>
    ts ? format.dateTime(new Date(ts), { month: "short", day: "numeric" }) : null;
  const eventDate = (ts: string | null) =>
    ts
      ? format.dateTime(new Date(ts), { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })
      : null;

  return (
    <div className="rounded-[18px] border border-slate-900/[.08] bg-white/60 p-5 dark:border-white/[.08] dark:bg-white/[.03]">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("trackingTitle")}</h2>
        {tracking.live ? (
          <span className="flex items-center gap-1.5 rounded-full border border-green-600/20 bg-green-50 px-2.5 py-1 text-[10.5px] font-semibold tracking-[.02em] text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-400">
            <Radio size={11} strokeWidth={2.4} className="animate-pulse" />
            {t("liveViaDhl")}
          </span>
        ) : (
          <span
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-900/[.1] bg-white px-2.5 py-1 text-[10.5px] font-semibold tracking-[.02em] text-slate-600 dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-300"
            data-method-badge={tracking.method}
          >
            <MethodIcon size={11} strokeWidth={2.4} />
            {methodBadge}
          </span>
        )}
      </div>

      {/* The waybill itself sits in the carrier strip below; the bare DHL
          number stays here only when there is no strip to carry it. */}
      {trackingNumber && tracking.method === "DHL" && !tracking.carrier?.trackingUrl ? (
        <div className="mb-5 font-mono text-[11.5px] tracking-[.03em] text-slate-400 dark:text-slate-500">{trackingNumber}</div>
      ) : (
        <div aria-hidden className="h-4" />
      )}

      {/* 4-node stepper. Each grid cell paints its own left/right connector
          halves — adjacent halves meet at the cell boundary, so the line
          reads as continuous while every node stays centered in its cell. */}
      <div className="grid grid-cols-4">
        {tracking.steps.map((step, idx) => {
          const isDone = step.state === "done";
          const isCurrent = step.state === "current";
          const leftReached = step.state !== "upcoming";
          const next = tracking.steps[idx + 1];
          const rightReached = Boolean(next && next.state !== "upcoming");
          return (
            <div key={step.key} data-step-label={step.label} data-state={step.state} className="relative flex flex-col items-center">
              {idx > 0 && (
                <div className="absolute left-0 right-1/2 top-[13px] h-[2px] bg-slate-900/[.09] dark:bg-white/[.09]">
                  {leftReached && (
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.4, delay: 0.15 + idx * 0.18, ease: "easeOut" }}
                      className="h-full w-full origin-left bg-blue-700 dark:bg-blue-500"
                    />
                  )}
                </div>
              )}
              {idx < tracking.steps.length - 1 && (
                <div className="absolute left-1/2 right-0 top-[13px] h-[2px] bg-slate-900/[.09] dark:bg-white/[.09]">
                  {rightReached && (
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.4, delay: 0.15 + (idx + 0.5) * 0.18, ease: "easeOut" }}
                      className="h-full w-full origin-left bg-blue-700 dark:bg-blue-500"
                    />
                  )}
                </div>
              )}

              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + idx * 0.18, type: "spring", stiffness: 320, damping: 20 }}
                className="relative z-[1]"
              >
                {isCurrent && (
                  <motion.span
                    animate={{ scale: [1, 1.9], opacity: [0.45, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                    className="absolute inset-0 rounded-full bg-blue-600/60 dark:bg-blue-400/50"
                  />
                )}
                <span
                  className={`relative flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? "border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-500"
                      : isCurrent
                        ? "border-blue-700 bg-white text-blue-700 shadow-[0_0_16px_-2px_rgba(29,78,216,0.55)] dark:border-blue-400 dark:bg-slate-900 dark:text-blue-400"
                        : "border-slate-900/[.14] bg-white text-transparent dark:border-white/[.16] dark:bg-white/[.05]"
                  }`}
                >
                  {isDone ? (
                    <Check size={13} strokeWidth={3} />
                  ) : (
                    <span className={`h-[7px] w-[7px] rounded-full ${isCurrent ? "bg-blue-700 dark:bg-blue-400" : ""}`} />
                  )}
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 + idx * 0.18, duration: 0.35, ease: "easeOut" }}
                className="mt-2.5 px-1 text-center"
              >
                <div
                  className={`text-[11.5px] font-semibold tracking-[-.01em] sm:text-[12.5px] ${
                    step.state === "upcoming"
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-slate-900 dark:text-slate-50"
                  }`}
                >
                  {t(STEP_LABEL_KEY[step.label])}
                </div>
                {stepDate(step.timestamp) && (
                  <div className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
                    {stepDate(step.timestamp)}
                  </div>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      <DispatchStrip tracking={tracking} />

      {trackingNumber && !tracking.live && tracking.method === "DHL" && (
        <p className="m-0 mt-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400">
          {t("trackingFallbackNote")}
        </p>
      )}

      {tracking.events.length > 0 && (
        <div className="mt-5 border-t border-slate-900/[.07] pt-4 dark:border-white/[.07]">
          <div className="mb-2 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
            {t("recentUpdates")}
          </div>
          <div className="flex flex-col gap-2.5">
            {tracking.events.map((event, idx) => (
              <motion.div
                data-checkpoint={event.stage ?? "carrier"}
                key={`${event.timestamp}-${idx}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + idx * 0.08, duration: 0.3, ease: "easeOut" }}
                className="flex items-baseline gap-3 text-[12px]"
              >
                <span className="w-[104px] flex-none text-slate-400 dark:text-slate-500">
                  {eventDate(event.timestamp) ?? "—"}
                </span>
                <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">
                  {event.stage ? (
                    <span className="font-semibold">{t(tracking.method === "PICKUP" && PICKUP_STAGE_LABEL[event.stage] ? PICKUP_STAGE_LABEL[event.stage]! : STAGE_LABEL_KEY[event.stage])}</span>
                  ) : (
                    event.description
                  )}
                  {event.note && <span className="block text-slate-500 dark:text-slate-400">{event.note}</span>}
                </span>
                {event.location && (
                  <span className="flex flex-none items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <MapPin size={10.5} strokeWidth={2} />
                    {event.location}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
