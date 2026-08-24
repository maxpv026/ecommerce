"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronLeft, CreditCard, Plus, Trash2 } from "lucide-react";
import { DEFAULT_PAYMENT_METHOD_ID, MOBILE_PAYMENT_METHODS } from "@/lib/mobilePaymentMethods";

export default function MobilePaymentMethodsLayout() {
  const router = useRouter();
  const [methods, setMethods] = useState(MOBILE_PAYMENT_METHODS);
  const [defaultId, setDefaultId] = useState(DEFAULT_PAYMENT_METHOD_ID);

  const removeMethod = (id: string) => {
    setMethods((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header: ambient mesh gradient strictly at the top, behind the header row only */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite]" />
          <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse]" />
        </div>

        <div className="relative flex items-center gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">Payment Methods</span>
          <span className="w-11 flex-none" />
        </div>
      </div>

      <div className="flex flex-col gap-3.5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        {methods.map((method) => {
          const isDefault = method.id === defaultId;
          return (
            <div
              key={method.id}
              className={`mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900 ${
                isDefault ? "ring-2 ring-blue-500/30" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                    <CreditCard size={17} strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold tracking-[-.02em]">
                      {method.brand} •••• {method.last4}
                    </span>
                    <span className="mt-[2px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                      Expires {method.expiry}
                    </span>
                  </span>
                </span>
                {isDefault && (
                  <span className="flex-none rounded-full border border-blue-700/[.18] bg-blue-50 px-2.5 py-1 text-[10.5px] font-semibold tracking-[-.01em] text-blue-700 dark:border-blue-400/20 dark:bg-blue-950 dark:text-blue-400">
                    Default
                  </span>
                )}
              </div>

              <div className="mt-3 text-[12px] text-slate-400 dark:text-slate-500">{method.holder}</div>

              <div className="mt-4 flex items-center gap-2 border-t border-slate-900/[.07] pt-3.5 dark:border-white/[.07]">
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefaultId(method.id)}
                    className="h-9 flex-none rounded-xl border-[1.5px] border-blue-700/35 bg-white px-3.5 text-xs font-semibold tracking-[-.01em] text-blue-700 transition-colors hover:border-blue-700/60 dark:bg-transparent dark:text-blue-400"
                  >
                    Set as Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeMethod(method.id)}
                  aria-label={`Remove ${method.brand} ending in ${method.last4}`}
                  className="ml-auto flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-900/[.12] bg-white text-slate-400 transition-colors hover:border-red-600/30 hover:text-red-600 dark:border-white/[.14] dark:bg-transparent dark:text-slate-500"
                >
                  <Trash2 size={14} strokeWidth={1.9} />
                </button>
              </div>
            </div>
          );
        })}

        {methods.length === 0 && (
          <div className="px-4 py-16 text-center text-[13.5px] text-slate-400 dark:text-slate-500">
            No saved payment methods.
          </div>
        )}
      </div>

      {/* Sticky Add Payment Method panel */}
      <div className="fixed bottom-0 left-0 z-[100] w-full border-t border-white/40 bg-white/78 px-4 pb-[env(safe-area-inset-bottom)] pt-3.5 shadow-[0_-16px_40px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/78">
        <Link
          href="/profile/settings/payments/add"
          className="mb-3.5 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
        >
          <Plus size={17} strokeWidth={2.4} />
          Add Payment Method
        </Link>
      </div>
    </div>
  );
}
