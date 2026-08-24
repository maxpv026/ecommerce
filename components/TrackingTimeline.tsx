"use client";

import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Check, MapPin, Radio } from "lucide-react";
import type { OrderTrackingView, TimelineStepKey } from "@/lib/tracking";

const STEP_LABEL_KEYS: Record<TimelineStepKey, string> = {
  placed: "stepPlaced",
  shipped: "stepShipped",
  inTransit: "stepInTransit",
  delivered: "stepDelivered",
};

interface TrackingTimelineProps {
  tracking: OrderTrackingView;
  trackingNumber: string | null;
}

export default function TrackingTimeline({ tracking, trackingNumber }: TrackingTimelineProps) {
  const t = useTranslations("Checkout");
  const format = useFormatter();

  const stepDate = (ts: string | null) =>
    ts ? format.dateTime(new Date(ts), { month: "short", day: "numeric" }) : null;
  const eventDate = (ts: string | null) =>
    ts
      ? format.dateTime(new Date(ts), { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })
      : null;

  return (
    <div className="rounded-[18px] border border-slate-900/[.08] bg-white/60 p-5 dark:border-white/[.08] dark:bg-white/[.03]">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("trackingTitle")}</h2>
        {tracking.live && (
          <span className="flex items-center gap-1.5 rounded-full border border-green-600/20 bg-green-50 px-2.5 py-1 text-[10.5px] font-semibold tracking-[.02em] text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-400">
            <Radio size={11} strokeWidth={2.4} className="animate-pulse" />
            {t("liveViaDhl")}
          </span>
        )}
      </div>

      {trackingNumber && (
        <div className="mb-5 font-mono text-[11.5px] tracking-[.03em] text-slate-400 dark:text-slate-500">
          {trackingNumber}
        </div>
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
            <div key={step.key} className="relative flex flex-col items-center">
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
                  {t(STEP_LABEL_KEYS[step.key])}
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

      {trackingNumber && !tracking.live && (
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
                key={`${event.timestamp}-${idx}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + idx * 0.08, duration: 0.3, ease: "easeOut" }}
                className="flex items-baseline gap-3 text-[12px]"
              >
                <span className="w-[104px] flex-none text-slate-400 dark:text-slate-500">
                  {eventDate(event.timestamp) ?? "—"}
                </span>
                <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">{event.description}</span>
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
    </div>
  );
}
