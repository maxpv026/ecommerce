"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { updateProfile } from "@/lib/actions/profile";

const ACCENT = "#1d4ed8";

const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(120),
  jobTitle: z.string().trim().max(80),
});

type ProfileForm = z.infer<typeof ProfileSchema>;

interface EditProfileModalProps {
  open: boolean;
  initial: { name: string; companyName: string; jobTitle: string };
  onClose: () => void;
  /** Fires after a successful save (parent toasts + refreshes). */
  onSaved: () => void;
}

export default function EditProfileModal({ open, initial, onClose, onSaved }: EditProfileModalProps) {
  const t = useTranslations("ProfileDashboard");
  const tAccount = useTranslations("AccountProfile");
  const [focus, setFocus] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const submit = handleSubmit(async (values) => {
    const result = await updateProfile(values);
    if (!result.ok) {
      toast.error(t("epToastError"));
      return;
    }
    onSaved();
  });

  const fields = [
    { key: "name" as const, label: t("epName") },
    { key: "companyName" as const, label: t("epCompany") },
    { key: "jobTitle" as const, label: t("epRole") },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-900/[.42] p-8 backdrop-blur-md dark:bg-[#090A0C]/80"
        >
          <motion.div
            initial={{ y: 14, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-edit-profile-modal
            className="relative w-[480px] max-w-full overflow-hidden rounded-[30px] border border-slate-900/[.14] bg-white/[.92] p-[30px] shadow-[0_60px_120px_-50px_rgba(2,4,10,.8)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-[rgba(20,21,24,.9)]"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[30px]">
              <div className="absolute -top-[46%] left-[-14%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_68%)] opacity-[.34] blur-[90px]" />
              <div className="absolute -bottom-[44%] right-[-16%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-[.28] blur-[90px]" />
            </div>

            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-[9px] text-[11px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                    {t("epEyebrow")}
                  </div>
                  <h3 className="m-0 text-2xl font-semibold tracking-[-.038em]">{t("epTitle")}</h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("adrCancel")}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-900/[.05] dark:text-ink-muted dark:hover:bg-white/10"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              <form onSubmit={submit} className="mt-[26px] flex flex-col gap-3.5">
                {fields.map((field) => {
                  const value = watch(field.key);
                  const focused = focus === field.key;
                  const lifted = focused || (value?.length ?? 0) > 0;
                  const invalid = Boolean(errors[field.key]);
                  return (
                    <label key={field.key} className="relative block">
                      <span
                        className="pointer-events-none absolute left-[15px] transition-all duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)]"
                        style={{
                          top: lifted ? 9 : 17,
                          fontSize: lifted ? 10 : 13,
                          letterSpacing: lifted ? ".07em" : "-.01em",
                          color: invalid ? "#ef4444" : focused ? ACCENT : "var(--hc-label-idle, #94a3b8)",
                        }}
                      >
                        {field.label}
                      </span>
                      <input
                        {...register(field.key)}
                        onFocus={() => setFocus(field.key)}
                        onBlurCapture={() => setFocus(null)}
                        className="h-14 w-full rounded-2xl border bg-slate-50 px-[15px] pb-2 pt-[22px] text-[13.5px] tracking-[-.01em] text-slate-900 transition-[border-color,box-shadow] duration-[240ms] focus:outline-none dark:bg-white/[.04] dark:text-slate-50"
                        style={{
                          borderColor: invalid ? "#ef4444" : focused ? ACCENT : "var(--hc-border-idle, rgba(15,23,42,.14))",
                          boxShadow: focused
                            ? `0 0 0 4px ${invalid ? "#ef444426" : ACCENT + "26"}, 0 0 22px -8px ${invalid ? "#ef4444" : ACCENT}`
                            : "none",
                        }}
                      />
                    </label>
                  );
                })}
                {errors.name && (
                  <p className="m-0 text-[12px] font-medium text-red-500 dark:text-red-400">{t("epNameError")}</p>
                )}

                <div className="mt-3.5 flex items-center justify-end gap-2.5">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    className="flex h-11 items-center justify-center rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-900/[.05] dark:border-white/10 dark:hover:bg-white/10"
                  >
                    {t("adrCancel")}
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-[22px] text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_18px_36px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800 disabled:opacity-60"
                  >
                    {isSubmitting && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
                    {tAccount("saveChanges")}
                  </motion.button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
