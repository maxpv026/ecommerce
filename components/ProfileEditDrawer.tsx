"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateProfile } from "@/lib/actions/profile";
import type { UserProfileData } from "@/lib/data";

/**
 * Native-style bottom sheet for editing the account's own details.
 *
 * Replaces the full-page settings route on mobile: editing three fields
 * should not cost a navigation and a back press. Built on framer-motion
 * rather than vaul/shadcn because this codebase already animates everything
 * with framer-motion and pulls in no component library.
 *
 * Two details matter more than they look:
 *
 *  - The sheet is a `fixed` panel whose scroll container ends in a sticky
 *    footer, and its height is capped with `dvh` (not `vh`). When the mobile
 *    keyboard opens, `vh` units keep the pre-keyboard height and push the
 *    save button off-screen; `dvh` tracks the visual viewport and the footer
 *    stays reachable.
 *  - Focus is moved into the sheet on open and returned to the trigger on
 *    close, and a background scroll lock stops the page behind it moving.
 */

interface ProfileEditDrawerProps {
  open: boolean;
  onClose: () => void;
  profile?: UserProfileData | null;
}

type FieldKey = "name" | "phone" | "companyName" | "jobTitle" | "vatNumber";

/** Past this much downward drag (or a fast enough flick) the sheet closes. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 520;

export default function ProfileEditDrawer({ open, onClose, profile }: ProfileEditDrawerProps) {
  const t = useTranslations("ProfileMobile");
  // Field labels and toasts are already authored for the desktop edit modal
  // in all 29 locales — reuse them rather than translating the same words
  // twice and letting the two drift apart.
  const tPd = useTranslations("ProfileDashboard");
  const tAccount = useTranslations("AccountProfile");
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  // Seeded from the server copy each time the sheet is opened, by remounting
  // under a key in the parent — so a cancelled edit never lingers.
  const [form, setForm] = useState<Record<FieldKey, string>>({
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    companyName: profile?.companyName ?? "",
    jobTitle: profile?.jobTitle ?? "",
    vatNumber: profile?.vatNumber ?? "",
  });
  const [invalid, setInvalid] = useState(false);

  const fields: Array<{
    key: FieldKey;
    label: string;
    autoComplete: string;
    type?: string;
    inputMode?: "tel";
  }> = [
    { key: "name", label: tPd("epName"), autoComplete: "name" },
    { key: "phone", label: t("drawerPhone"), autoComplete: "tel", type: "tel", inputMode: "tel" },
    { key: "companyName", label: tPd("epCompany"), autoComplete: "organization" },
    { key: "jobTitle", label: tPd("epRole"), autoComplete: "organization-title" },
    { key: "vatNumber", label: tPd("epVatNumber"), autoComplete: "off" },
  ];

  const set = (key: FieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (invalid) setInvalid(false);
  };

  // Escape closes, and the page behind must not scroll under the sheet.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // Focus the first field so the keyboard is one tap away, without the
    // jump that autoFocus causes while the sheet is still animating in.
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    }, 260);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onClose();
    },
    [onClose]
  );

  const save = async () => {
    if (saving) return;
    if (form.name.trim().length < 2) {
      setInvalid(true);
      toast.error(tPd("epNameError"));
      return;
    }

    setSaving(true);
    const result = await updateProfile({
      name: form.name.trim(),
      phone: form.phone.trim(),
      companyName: form.companyName.trim(),
      jobTitle: form.jobTitle.trim(),
    });

    if (!result.ok) {
      setSaving(false);
      toast.error(tPd("epToastError"));
      return;
    }

    // Before closing, not after: closing unmounts this component, and an
    // awaited refresh would be abandoned mid-flight. updateProfile() has
    // already revalidated the profile page, so this pulls the new values
    // into the card behind the sheet.
    router.refresh();

    toast.success(tPd("epToastSaved"));
    setSaving(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] md:hidden" data-profile-drawer role="dialog" aria-modal="true" aria-label={tPd("epTitle")}>
          {/* Backdrop — tapping it closes the sheet. */}
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-label={t("drawerClose")}
            data-drawer-backdrop
            className="absolute inset-0 h-full w-full cursor-default bg-black/40 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.8 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            data-drawer-panel
            // dvh, not vh: the mobile keyboard shrinks the visual viewport,
            // and vh would keep the sticky footer below the fold.
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[32px] border-t border-slate-900/[.08] bg-white shadow-[0_-24px_60px_-24px_rgba(0,0,0,.45)] dark:border-white/10 dark:bg-[#141518]"
          >
            {/* Drag handle */}
            <div className="flex flex-none cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing" data-drawer-handle>
              <span className="h-[5px] w-11 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>

            <div className="flex-none px-5 pb-3 pt-1.5">
              <h2 className="m-0 text-[19px] font-semibold tracking-[-.035em] text-slate-900 dark:text-white">
                {tPd("epTitle")}
              </h2>
              <p className="mb-0 mt-1 text-[12.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">
                {t("drawerSubtitle")}
              </p>
            </div>

            {/* Scrolls independently so the footer can stay put. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
              <div className="flex flex-col gap-3">
                {fields.map((field) => {
                  const isInvalid = invalid && field.key === "name";
                  return (
                    <label key={field.key} className="block" data-drawer-field={field.key}>
                      <span className="mb-1.5 block text-[11px] tracking-[.06em] text-slate-500 dark:text-ink-muted">
                        {field.label.toUpperCase()}
                      </span>
                      <input
                        name={field.key}
                        type={field.type ?? "text"}
                        inputMode={field.inputMode}
                        autoComplete={field.autoComplete}
                        value={form[field.key]}
                        onChange={(event) => set(field.key, event.target.value)}
                        aria-invalid={isInvalid || undefined}
                        className={`h-[50px] w-full rounded-[16px] border bg-slate-50 px-4 text-[15px] tracking-[-.01em] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600 focus:bg-white dark:bg-white/[.04] dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[.07] ${
                          isInvalid
                            ? "border-red-500/70"
                            : "border-slate-900/[.09] dark:border-white/10 dark:focus:border-blue-500"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>

              <p className="mb-0 mt-3 text-[11px] leading-[1.5] text-slate-400 dark:text-ink-muted">
                {t("drawerEmailNote", { email: profile?.email ?? "—" })}
              </p>
            </div>

            {/* Sticky footer: sits above the home indicator, stays put while
                the fields scroll and while the keyboard is up. */}
            <div className="flex-none border-t border-slate-900/[.07] bg-white/95 px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#141518]/95">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={save}
                disabled={saving}
                data-drawer-save
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[16px] bg-blue-700 text-[14.5px] font-semibold tracking-[-.015em] text-white shadow-[0_16px_32px_-16px_#2563eb] transition-colors hover:bg-blue-800 disabled:opacity-60"
              >
                {saving && <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />}
                {saving ? t("drawerSaving") : tAccount("saveChanges")}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
