"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { Building2, Check, ExternalLink, Loader2, MapPin, Truck, Undo2, UserRound, Warehouse } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { advanceOrderShipment, revertOrderShipment, saveOrderFulfilment } from "@/lib/actions/adminOrders";
import type { AdminOrderRow } from "@/lib/adminOrders";
import {
  CARRIERS,
  FREIGHT_CARRIERS,
  STAGE_SEQUENCE,
  emailForTransition,
  isDispatchedStage,
  nextStage,
  previousStage,
  stageIndex,
  templateTrackingUrl,
  type CarrierCode,
  type FulfilmentMethod,
  type ShipmentStage,
} from "@/lib/shipping/carriers";

/**
 * Admin → Orders → one order's fulfilment: who carries it (DHL, a freight
 * carrier with a waybill, our own ADR vehicle, or collection at the
 * warehouse), the details the buyer sees, and the stage track with its
 * checkpoint log. Every write goes through lib/shipping/update — the same
 * engine as the CRM webhook.
 */

const METHODS: FulfilmentMethod[] = ["DHL", "FREIGHT", "OWN_FLEET", "PICKUP"];
const METHOD_ICON = { DHL: Truck, FREIGHT: Building2, OWN_FLEET: UserRound, PICKUP: Warehouse } as const;
const DEFAULT_CARRIER: Record<FulfilmentMethod, CarrierCode> = { DHL: "DHL", FREIGHT: "DB_SCHENKER", OWN_FLEET: "OWN_FLEET", PICKUP: "PICKUP" };

const INPUT =
  "h-10 w-full rounded-[11px] border border-slate-900/[.12] bg-white px-3 text-[13px] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.03]";
const LABEL = "mb-1 block text-[10.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-slate-400";

/** ISO → the value a datetime-local input wants, in the admin's own timezone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type ShipmentResult = { ok: true; stage?: string; email?: string | null } | { ok: false; error: string; code: string };

function useShipmentAction() {
  const t = useTranslations("AdminShipping");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ShipmentResult>, success: (r: Extract<ShipmentResult, { ok: true }>) => string, done?: () => void) =>
    start(async () => {
      const result = await action().catch(() => null);
      if (!result?.ok) {
        const code = result && !result.ok ? result.code : "FAILED";
        toast.error(t.has(`error_${code}`) ? t(`error_${code}`) : (result && !result.ok ? result.error : t("error_FAILED")));
        return;
      }
      toast.success(success(result));
      done?.();
      router.refresh();
    });
  return { pending, run };
}

export function stageLabel(t: ReturnType<typeof useTranslations>, method: FulfilmentMethod, stage: ShipmentStage) {
  return method === "PICKUP" && stage === "DELIVERED" ? t("stagePickup_DELIVERED") : t(`stage_${stage}`);
}

export default function AdminFulfilmentPanel({ order, pickupAddress }: { order: AdminOrderRow; pickupAddress: string | null }) {
  const t = useTranslations("AdminShipping");
  const format = useFormatter();
  const s = order.shipment;
  const [method, setMethod] = useState<FulfilmentMethod>(s.method);
  const [carrier, setCarrier] = useState<CarrierCode>(s.method === "FREIGHT" ? s.carrier : DEFAULT_CARRIER.FREIGHT);
  const [carrierName, setCarrierName] = useState(s.carrierName ?? "");
  const [reference, setReference] = useState(order.trackingNumber ?? "");
  const [url, setUrl] = useState(s.trackingUrl ?? "");
  const [urlTouched, setUrlTouched] = useState(Boolean(s.trackingUrl));
  const [plate, setPlate] = useState(s.vehiclePlate ?? "");
  const [driver, setDriver] = useState(s.driverName ?? "");
  const [phone, setPhone] = useState(s.driverPhone ?? "");
  const [notes, setNotes] = useState(s.deliveryNotes ?? "");
  const [eta, setEta] = useState(toLocalInput(order.estimatedDelivery));
  const { pending, run } = useShipmentAction();

  const code: CarrierCode = method === "FREIGHT" ? carrier : DEFAULT_CARRIER[method];
  const template = templateTrackingUrl(code, reference);
  const shownUrl = urlTouched ? url : (template ?? "");
  const seq = STAGE_SEQUENCE[s.method];
  const current = stageIndex(s.method, s.stage);
  const back = previousStage(s.method, s.stage);
  const methodLocked = (m: FulfilmentMethod) => !STAGE_SEQUENCE[m].includes(s.stage);

  const save = () =>
    run(
      () =>
        saveOrderFulfilment(order.id, {
          carrier: code,
          carrierName: method === "FREIGHT" ? carrierName : "",
          trackingNumber: method === "DHL" || method === "FREIGHT" ? reference : "",
          trackingUrl: method === "FREIGHT" || method === "DHL" ? shownUrl : "",
          driverName: driver,
          driverPhone: phone,
          vehiclePlate: plate,
          deliveryNotes: notes,
          estimatedDelivery: eta ? new Date(eta).toISOString() : "",
        }),
      () => t("saved")
    );

  return (
    <section className="mt-5 rounded-[18px] border border-slate-900/[.08] bg-white p-5 dark:border-white/[.08] dark:bg-white/[.02]" data-fulfilment-panel={order.orderNumber}>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* ── Method + details ── */}
        <div>
          <h4 className="m-0 mb-3 text-[13px] font-semibold tracking-[-.01em]">{t("title")}</h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label={t("method")}>
            {METHODS.map((m) => {
              const Icon = METHOD_ICON[m];
              const on = method === m;
              const locked = methodLocked(m);
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={locked}
                  title={locked ? t("error_METHOD_LOCKED") : undefined}
                  data-method-option={m}
                  onClick={() => setMethod(m)}
                  className={`flex min-h-[54px] flex-col items-start justify-center gap-1 rounded-[12px] border px-3 py-2 text-left text-[12px] font-semibold leading-[1.25] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    on
                      ? "border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-600/20 dark:border-blue-400 dark:bg-blue-400/10 dark:text-blue-200"
                      : "border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.03] dark:border-white/[.12] dark:text-slate-300 dark:hover:bg-white/[.04]"
                  }`}
                >
                  <Icon size={14} strokeWidth={2.1} />
                  {t(`method_${m}`)}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {method === "FREIGHT" && (
              <>
                <label>
                  <span className={LABEL}>{t("carrier")}</span>
                  <select value={carrier} onChange={(e) => { setCarrier(e.target.value as CarrierCode); setUrlTouched(false); }} className={INPUT} data-carrier-select>
                    {FREIGHT_CARRIERS.map((c) => (
                      <option key={c} value={c}>
                        {c === "OTHER" ? t("carrierOther") : CARRIERS[c].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={LABEL}>{carrier === "OTHER" ? t("carrierNameRequired") : t("carrierName")}</span>
                  <input value={carrierName} onChange={(e) => setCarrierName(e.target.value)} placeholder={carrier === "OTHER" ? t("carrierNamePlaceholder") : `${CARRIERS[carrier].name ?? ""} ADR`} className={INPUT} data-carrier-name />
                </label>
              </>
            )}
            {(method === "DHL" || method === "FREIGHT") && (
              <>
                <label>
                  <span className={LABEL}>{method === "DHL" ? t("dhlTracking") : t("waybill")}</span>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${INPUT} font-mono uppercase`} data-tracking-input />
                </label>
                <label>
                  <span className={LABEL}>{t("trackingUrl")}</span>
                  <input
                    value={shownUrl}
                    onChange={(e) => { setUrl(e.target.value); setUrlTouched(true); }}
                    placeholder="https://"
                    className={`${INPUT} text-[12px]`}
                    data-tracking-url
                  />
                  <span className="mt-1 block text-[11px] leading-[1.45] text-slate-500 dark:text-slate-400">
                    {CARRIERS[code].url ? t("trackingUrlAuto") : t("trackingUrlManual")}
                  </span>
                </label>
              </>
            )}
            {method === "OWN_FLEET" && (
              <>
                <label>
                  <span className={LABEL}>{t("vehiclePlate")}</span>
                  <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="AA 1234 BB" className={`${INPUT} font-mono uppercase`} data-vehicle-plate />
                </label>
                <label>
                  <span className={LABEL}>{t("driverName")}</span>
                  <input value={driver} onChange={(e) => setDriver(e.target.value)} className={INPUT} data-driver-name />
                </label>
                <label>
                  <span className={LABEL}>{t("driverPhone")}</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+380 …" className={`${INPUT} font-mono`} data-driver-phone />
                </label>
              </>
            )}
            {method !== "PICKUP" && (
              <label>
                <span className={LABEL}>{t("eta")}</span>
                <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} className={INPUT} data-eta />
              </label>
            )}
            {method === "PICKUP" && (
              <p className="m-0 rounded-[11px] bg-slate-50 px-3 py-2.5 text-[12px] leading-[1.5] text-slate-600 sm:col-span-2 dark:bg-white/[.04] dark:text-slate-300" data-pickup-config>
                <MapPin size={12} className="mr-1 inline -translate-y-px" />
                {pickupAddress ? t("pickupConfigured", { address: pickupAddress }) : t("pickupNotConfigured")}
              </p>
            )}
            <label className="sm:col-span-2">
              <span className={LABEL}>{method === "PICKUP" ? t("pickupNotes") : t("notes")}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={method === "PICKUP" ? t("pickupNotesPlaceholder") : t("notesPlaceholder")}
                className={`${INPUT} h-auto py-2 leading-[1.5]`}
                data-delivery-notes
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              data-save-fulfilment
              className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#0B1020] px-4 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t("save")}
            </button>
            {s.publicUrl && (
              <a href={s.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-public-url>
                {t("openTracking")} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>

        {/* ── Stage track + checkpoints ── */}
        <div>
          <h4 className="m-0 mb-3 text-[13px] font-semibold tracking-[-.01em]">{t("stagesTitle")}</h4>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-stage-track>
            {seq.map((stage, i) => {
              const state = i < current ? "done" : i === current ? "current" : "upcoming";
              return (
                <li key={stage} data-stage={stage} data-state={state} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                      state === "done"
                        ? "bg-blue-600 text-white"
                        : state === "current"
                          ? "bg-amber-500/15 text-amber-700 ring-2 ring-amber-500/60 dark:text-amber-300"
                          : "bg-slate-900/[.06] text-slate-400 dark:bg-white/[.07]"
                    }`}
                  >
                    {state === "done" ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={state === "upcoming" ? "text-slate-400" : "font-semibold"}>{stageLabel(t, s.method, stage)}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 border-t border-slate-900/[.07] pt-3 dark:border-white/[.07]">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-slate-400">{t("checkpoints")}</div>
            {s.events.length === 0 ? (
              <p className="m-0 text-[12px] text-slate-400">{t("noCheckpoints")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0" data-checkpoints>
                {[...s.events].reverse().map((e, i) => (
                  <li key={`${e.at}-${i}`} className="text-[12px] leading-[1.45]">
                    <span className="font-semibold">{stageLabel(t, s.method, e.stage)}</span>
                    <span className="text-slate-400"> · {format.dateTime(new Date(e.at), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {t(`source_${e.source}`)}</span>
                    {(e.location || e.note) && (
                      <span className="block text-slate-600 dark:text-slate-300">{[e.location, e.note].filter(Boolean).join(" — ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {back && (
            <RevertButton orderId={order.id} label={t("moveBack", { stage: stageLabel(t, s.method, back) })} done={t("movedBack", { stage: stageLabel(t, s.method, back) })} />
          )}
        </div>
      </div>
    </section>
  );
}

function RevertButton({ orderId, label, done }: { orderId: string; label: string; done: string }) {
  const { pending, run } = useShipmentAction();
  return (
    <button
      type="button"
      disabled={pending}
      data-action="undo"
      onClick={() => run(() => revertOrderShipment(orderId), () => done)}
      className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
      {label}
    </button>
  );
}

/** The row's one-click "next stage" button, or "set up shipment" when something is missing. */
export function AdvanceButton({ order, onSetup, onAdvance }: { order: AdminOrderRow; onSetup: () => void; onAdvance: () => void }) {
  const t = useTranslations("AdminShipping");
  const s = order.shipment;
  const next = nextStage(s.method, s.stage);
  if (!next) return <span className="text-[12px] text-slate-400">—</span>;
  const blocked = s.method === "DHL" && isDispatchedStage(next) && !order.trackingNumber;
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-semibold";
  return blocked ? (
    <button type="button" data-action="setup" onClick={onSetup} title={t("error_TRACKING_REQUIRED")} className={`${btn} border border-slate-900/[.14] hover:bg-slate-900/[.04] dark:border-white/[.14]`}>
      <Truck size={13} /> {t("setUp")}
    </button>
  ) : (
    <button type="button" data-action="advance" data-next-stage={next} onClick={onAdvance} className={`${btn} ${next === "DELIVERED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-700 hover:bg-blue-800"} text-white`}>
      <Truck size={13} /> {t("advanceTo", { stage: stageLabel(t, s.method, next) })}
    </button>
  );
}

/** Move to a stage (the next one by default; skipping ahead or logging a checkpoint at the current one is allowed). */
export function AdvanceDialog({ order, onClose }: { order: AdminOrderRow; onClose: () => void }) {
  const t = useTranslations("AdminShipping");
  const s = order.shipment;
  const options = STAGE_SEQUENCE[s.method].filter((st) => stageIndex(s.method, st) >= stageIndex(s.method, s.stage));
  const [stage, setStage] = useState<ShipmentStage>(nextStage(s.method, s.stage) ?? s.stage);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const { pending, run } = useShipmentAction();
  const email = emailForTransition(s.method, s.stage, stage);
  const checkpoint = stage === s.stage;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="advance-title" onClick={() => !pending && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-[480px] max-w-full rounded-[24px] bg-white p-7 shadow-2xl dark:bg-surface" data-order-dialog="advance">
        <h3 id="advance-title" className="m-0 text-[19px] font-semibold tracking-[-.03em]">
          {t("advanceTitle", { order: order.orderNumber })}
        </h3>
        <div className="mt-4 grid gap-3">
          <label>
            <span className={LABEL}>{t("stageSelect")}</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as ShipmentStage)} className={INPUT} data-stage-select>
              {options.map((st) => (
                <option key={st} value={st}>
                  {stageLabel(t, s.method, st)}
                  {st === s.stage ? ` (${t("current")})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>{t("location")}</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPlaceholder")} maxLength={120} className={INPUT} data-checkpoint-location />
          </label>
          <label>
            <span className={LABEL}>{t("note")}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} maxLength={280} className={INPUT} data-checkpoint-note />
          </label>
        </div>
        <p className="m-0 mt-3 text-[12px] leading-[1.5] text-slate-500 dark:text-slate-400" data-email-hint={email ?? "none"}>
          {checkpoint ? t("sameStageHint") : email ? t("emailHint", { email: t(`email_${email}`) }) : t("emailNone")}
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" disabled={pending} onClick={onClose} className="h-11 rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.14]">
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={pending || (checkpoint && !location.trim() && !note.trim())}
            data-confirm-order-action
            onClick={() =>
              run(
                () => advanceOrderShipment(order.id, { stage, location, note }),
                () => t("advanced", { order: order.orderNumber, stage: stageLabel(t, s.method, stage) }),
                onClose
              )
            }
            className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[13.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {t("confirmAdvance")}
          </button>
        </div>
      </div>
    </div>
  );
}
