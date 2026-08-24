"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";

const NAV_ITEMS = [
  { id: "info", labelKey: "navPersonalInfo" },
  { id: "orders", labelKey: "navOrderHistory" },
  { id: "security", labelKey: "navSecurity" },
  { id: "certifications", labelKey: "navCertifications" },
];

export default function AccountSidebar() {
  const t = useTranslations("AccountProfile");
  const tAuth = useTranslations("Auth");
  const [active, setActive] = useState("info");
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  const goTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut({ redirect: false });
    toast.success(tAuth("toastSignedOut"));
    router.push("/");
    router.refresh();
  };

  return (
    <aside className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-[92px] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => goTo(item.id)}
            className={
              isActive
                ? "flex h-[42px] flex-none items-center gap-2.5 whitespace-nowrap rounded-xl bg-blue-700/[.08] px-3.5 text-left text-[13.5px] font-semibold tracking-[-.01em] text-blue-700 lg:w-full dark:bg-blue-400/10 dark:text-blue-400"
                : "flex h-[42px] flex-none items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 text-left text-[13.5px] font-medium tracking-[-.01em] text-slate-600 transition-colors hover:bg-slate-900/[.03] lg:w-full dark:text-slate-400 dark:hover:bg-white/5"
            }
          >
            <span
              className={`h-[5px] w-[5px] flex-none rounded-full ${
                isActive ? "bg-blue-700 dark:bg-blue-400" : "bg-transparent"
              }`}
            />
            {t(item.labelKey)}
          </button>
        );
      })}
      <button
        type="button"
        onClick={handleLogout}
        disabled={signingOut}
        className="flex h-[42px] flex-none items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 text-left text-[13.5px] font-medium tracking-[-.01em] text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50 lg:w-full dark:text-slate-500 dark:hover:text-slate-300"
      >
        <span className="h-[5px] w-[5px] flex-none rounded-full bg-transparent" />
        {t("navLogout")}
      </button>
    </aside>
  );
}
