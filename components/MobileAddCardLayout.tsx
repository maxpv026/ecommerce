"use client";

import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { ChevronLeft, CreditCard } from "lucide-react";

const inputClasses =
  "h-[50px] w-full rounded-2xl border border-slate-900/[.12] bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500";

export default function MobileAddCardLayout() {
  const router = useRouter();
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [holder, setHolder] = useState("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo-only: no shared payment-methods store to persist into yet, so
    // saving just simulates success and returns to the list.
    router.back();
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
          <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">Add Card</span>
          <span className="w-11 flex-none" />
        </div>
      </div>

      <form onSubmit={handleSave} className="pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              <CreditCard size={17} strokeWidth={1.8} />
            </span>
            <span className="text-[14px] font-semibold tracking-[-.02em]">Card details</span>
          </div>

          <div className="flex flex-col gap-3.5">
            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                CARD NUMBER
              </label>
              <input
                required
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="4242 4242 4242 4242"
                className={inputClasses}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                  EXPIRY
                </label>
                <input
                  required
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  placeholder="MM/YY"
                  className={inputClasses}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                  CVC
                </label>
                <input
                  required
                  inputMode="numeric"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value)}
                  placeholder="123"
                  className={inputClasses}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                CARDHOLDER NAME
              </label>
              <input
                required
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="Name on card"
                className={inputClasses}
              />
            </div>
          </div>
        </div>

        {/* Sticky Save Card panel */}
        <div className="fixed bottom-0 left-0 z-[100] w-full border-t border-white/40 bg-white/78 px-4 pb-[env(safe-area-inset-bottom)] pt-3.5 shadow-[0_-16px_40px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/78">
          <button
            type="submit"
            className="mb-3.5 flex h-[52px] w-full items-center justify-center rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
          >
            Save Card
          </button>
        </div>
      </form>
    </div>
  );
}
