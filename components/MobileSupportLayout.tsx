"use client";

import { useState } from "react";
import { Check, ChevronDown, Mail, Phone, Send } from "lucide-react";
import { FAQ_ENTRIES } from "@/lib/mobileSupport";
import MobileSubPageHeader from "./MobileSubPageHeader";

const inputClasses =
  "w-full rounded-2xl border border-slate-900/[.12] bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500";

export default function MobileSupportLayout() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ENTRIES[0]?.id ?? null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const toggleFaq = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title="Help Center" />

      <div className="flex flex-col gap-5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 grid grid-cols-2 gap-2.5">
          <a
            href="mailto:support@myenergy.eu"
            className="flex flex-col items-start gap-2.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              <Mail size={17} strokeWidth={1.8} />
            </span>
            <span className="text-[12.5px] font-semibold tracking-[-.01em]">support@myenergy.eu</span>
          </a>
          <a
            href="tel:+31201234567"
            className="flex flex-col items-start gap-2.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              <Phone size={17} strokeWidth={1.8} />
            </span>
            <span className="text-[12.5px] font-semibold tracking-[-.01em]">+31 20 123 4567</span>
          </a>
        </div>

        <div className="px-4">
          <div className="mb-2.5 px-1.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
            FREQUENTLY ASKED QUESTIONS
          </div>
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-slate-900">
            {FAQ_ENTRIES.map((faq, idx) => {
              const isLast = idx === FAQ_ENTRIES.length - 1;
              const open = openId === faq.id;
              return (
                <div key={faq.id} className={isLast ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"}>
                  <button
                    type="button"
                    onClick={() => toggleFaq(faq.id)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  >
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold tracking-[-.015em]">
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      className={`flex-none text-slate-400 transition-transform duration-200 dark:text-slate-500 ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open && (
                    <div className="px-5 pb-4 text-[12.5px] leading-[1.55] text-slate-500 dark:text-slate-400">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4">
          <div className="mb-2.5 px-1.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
            CONTACT SUPPORT
          </div>
          <form onSubmit={handleSend} className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
            {sent ? (
              <div className="flex flex-col items-center gap-2.5 py-4 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <Check size={20} strokeWidth={2.4} />
                </span>
                <p className="text-[13.5px] font-semibold tracking-[-.015em]">Message sent</p>
                <p className="text-[12px] text-slate-400 dark:text-slate-500">
                  We typically reply within one business day.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                    SUBJECT
                  </label>
                  <input
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What can we help with?"
                    className={`h-[50px] ${inputClasses}`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                    MESSAGE
                  </label>
                  <textarea
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the issue or question..."
                    rows={4}
                    className={`resize-none py-3 ${inputClasses}`}
                  />
                </div>
                <button
                  type="submit"
                  className="mt-1 flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
                >
                  <Send size={16} strokeWidth={2} />
                  Send Message
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
