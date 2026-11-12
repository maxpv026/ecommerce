"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, PackageOpen, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { MicroBadge, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE, Stepper, type BadgeTone } from "@/components/home/ui";
import { cancelCylinderReturn, requestCylinderReturn } from "@/lib/actions/cylinderReturn";
import type { UserAddress } from "@/lib/data";
import type { CylinderFleet } from "@/lib/profileHub";
import { EmptyRow, GroupTitle, SurfaceHead } from "./parts";

const STATUS_TONE: Record<string, BadgeTone> = { REQUESTED: "warn", SCHEDULED: "info", COLLECTED: "ok", CANCELLED: "muted" };

/**
 * Returnable cylinders and their deposits, from the cylinder ledger
 * (lib/invoicing getCylinderLedger) — not estimated from orders. The return
 * form files a request for the logistics team (lib/actions/cylinderReturn).
 */
export default function CylindersView({
  fleet,
  addresses,
  pickup,
  iban,
  onEdit,
}: {
  fleet: CylinderFleet;
  addresses: UserAddress[];
  pickup: { location: string | null; hours: string | null };
  iban: string | null;
  onEdit: () => void;
}) {
  const t = useTranslations("ProfileHub");
  const format = useFormatter();
  const router = useRouter();
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const openQty = fleet.requests.filter((r) => r.status === "REQUESTED" || r.status === "SCHEDULED").reduce((n, r) => n + r.quantity, 0);
  const available = Math.max(0, fleet.inPossession - openQty);

  const [formOpen, setFormOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<"PICKUP" | "DROP_OFF">("PICKUP");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const result = await requestCylinderReturn({
        quantity: Math.min(qty, available),
        method,
        ...(method === "PICKUP" ? { addressId } : {}),
        ...(date ? { preferredDate: date } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }).catch(() => null);
      if (!result?.ok) {
        toast.error(t(`returnError_${result && !result.ok ? result.code : "FAILED"}`));
        return;
      }
      toast.success(t("returnRequested"));
      setFormOpen(false);
      router.refresh();
    });

  const cancel = (id: string) =>
    start(async () => {
      const result = await cancelCylinderReturn(id).catch(() => null);
      if (result?.ok) router.refresh();
      else toast.error(t("returnError_FAILED"));
    });

  return (
    <div className={SURFACE} data-profile-cylinders>
      <SurfaceHead title={t("fleetTitle")} meta={[t("fleetMeta")]} id="cylinders">
        <button type="button" onClick={() => setFormOpen((v) => !v)} disabled={available === 0} className={ROW_ACTION_PRIMARY} data-return-open>
          <PackageOpen size={14} strokeWidth={2.2} />
          {t("returnCta")}
        </button>
      </SurfaceHead>

      {/* Balance */}
      <div className="grid grid-cols-4 divide-x divide-slate-900/[.06] border-b border-slate-900/[.06] dark:divide-white/[.06] dark:border-white/[.06]" data-fleet-balance>
        {[
          { k: "held", label: t("fleetHeld"), value: String(fleet.inPossession) },
          { k: "deposit", label: t("fleetDeposit"), value: `${fleet.refundableIsEstimate ? "≈ " : ""}${eur(fleet.refundable)}` },
          { k: "issued", label: t("fleetIssued"), value: String(fleet.borrowed) },
          { k: "returned", label: t("fleetReturned"), value: String(fleet.returned) },
        ].map((s) => (
          <div key={s.k} className="px-5 py-4" data-fleet={s.k}>
            <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">{s.label}</div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-.03em]">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/[.06] px-5 py-2.5 text-[12px] text-slate-500 dark:border-white/[.06] dark:text-ink-muted">
        <span>{fleet.depositEach !== null ? t("fleetDepositEach", { amount: eur(fleet.depositEach) }) : fleet.refundableIsEstimate ? t("fleetDepositMixed") : t("fleetNoDeposit")}</span>
        {iban ? (
          <span data-fleet-iban="set">{t("refundTo", { iban: `•••• ${iban.slice(-4)}` })}</span>
        ) : (
          <button type="button" onClick={onEdit} className="font-semibold text-blue-700 hover:underline dark:text-blue-400" data-fleet-iban="missing">
            {t("refundAddIban")}
          </button>
        )}
      </div>

      {/* Return form */}
      {formOpen && available > 0 && (
        <div className="border-b border-slate-900/[.06] bg-slate-900/[.015] px-5 py-4 dark:border-white/[.06] dark:bg-white/[.02]" data-return-form>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">{t("returnQty")}</div>
              <Stepper value={Math.min(qty, available)} onChange={setQty} max={available} decreaseLabel={t("qtyDecrease")} increaseLabel={t("qtyIncrease")} data-return-qty />
            </div>
            <div role="radiogroup" aria-label={t("returnMethod")}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">{t("returnMethod")}</div>
              <div className="inline-flex rounded-full border border-slate-900/[.12] bg-white/70 p-1 dark:border-white/[.14] dark:bg-white/[.04]">
                {(["PICKUP", "DROP_OFF"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} data-return-method={m} className={`h-[30px] rounded-full px-3 text-[12.5px] font-semibold ${method === m ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}>
                    {t(`returnMethod_${m}`)}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">{t("returnDate")}</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-return-date className="h-9 rounded-[10px] border border-slate-900/[.12] bg-white px-2.5 text-[13px] dark:border-white/[.14] dark:bg-white/[.04]" />
            </label>
          </div>
          {method === "PICKUP" ? (
            addresses.length ? (
              <label className="mt-3 block">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">{t("returnAddress")}</div>
                <select value={addressId} onChange={(e) => setAddressId(e.target.value)} data-return-address className="h-10 w-full rounded-[10px] border border-slate-900/[.12] bg-white px-2.5 text-[13px] dark:border-white/[.14] dark:bg-white/[.04] [&>option]:text-slate-900">
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>{`${a.title} — ${a.fullAddress}`}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="m-0 mt-3 text-[12.5px] text-amber-700 dark:text-amber-300">{t("returnNeedsAddress")}</p>
            )
          ) : (
            <p className="m-0 mt-3 text-[12.5px] text-slate-600 dark:text-slate-300" data-return-dropoff>
              {pickup.location ? t("dropOffAt", { location: pickup.location, hours: pickup.hours ?? t("hoursConfirm") }) : t("dropOffConfirm")}
            </p>
          )}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} placeholder={t("returnNotes")} rows={2} data-return-notes className="mt-3 w-full resize-none rounded-[10px] border border-slate-900/[.12] bg-white px-3 py-2 text-[13px] dark:border-white/[.14] dark:bg-white/[.04]" />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className={ROW_ACTION_GHOST}>
              {t("cancel")}
            </button>
            <button type="button" onClick={submit} disabled={pending || (method === "PICKUP" && !addressId)} className={ROW_ACTION_PRIMARY} data-return-submit>
              {pending && <Loader2 size={14} className="animate-spin" />}
              {t("returnSubmit", { count: Math.min(qty, available) })}
            </button>
          </div>
        </div>
      )}

      {/* Issued by type */}
      <GroupTitle>{t("fleetByType")}</GroupTitle>
      {fleet.issuedByType.length === 0 ? (
        <EmptyRow>{t("fleetEmpty")}</EmptyRow>
      ) : (
        fleet.issuedByType.map((row) => (
          <div key={row.sku} className="flex items-center justify-between gap-3 border-b border-slate-900/[.06] px-5 py-3 last:border-b-0 dark:border-white/[.06]" data-fleet-type={row.sku}>
            <span className="min-w-0 truncate text-[13.5px]">
              <span className="font-semibold">{row.name}</span> <span className="text-slate-500 dark:text-ink-muted">· {row.variant} · <span className="font-mono">{row.sku}</span></span>
            </span>
            <span className="flex-none text-[13px] font-semibold tabular-nums">{t("issuedCount", { count: row.quantity })}</span>
          </div>
        ))
      )}

      {/* Requests */}
      {fleet.requests.length > 0 && (
        <>
          <GroupTitle>{t("returnRequests")}</GroupTitle>
          {fleet.requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-900/[.06] px-5 py-3 last:border-b-0 dark:border-white/[.06]" data-return-request={r.status}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13.5px]">
                  <span className="font-semibold">{t("returnLine", { count: r.quantity })}</span>
                  <MicroBadge tone={STATUS_TONE[r.status] ?? "muted"}>{t(`returnStatus_${r.status}`)}</MicroBadge>
                </div>
                <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
                  {t(`returnMethod_${r.method}`)}
                  {r.preferredDate ? ` · ${format.dateTime(new Date(r.preferredDate), { dateStyle: "medium", timeZone: "UTC" })}` : ""}
                  {r.addressText ? ` · ${r.addressText}` : ""}
                </div>
              </div>
              {r.status === "REQUESTED" && (
                <button type="button" onClick={() => cancel(r.id)} disabled={pending} className={ROW_ACTION_GHOST} data-return-cancel>
                  <X size={13} strokeWidth={2.4} />
                  {t("cancel")}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
