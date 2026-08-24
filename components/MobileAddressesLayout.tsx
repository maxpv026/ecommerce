"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Briefcase, ChevronLeft, Home, Pencil, Plus, Trash2, Truck } from "lucide-react";
import type { UserAddress } from "@/lib/data";

// The Address model has no icon field — infer a reasonable glyph from the
// title so cards still get a visual distinction between e.g. "Office" and
// "Home" entries.
function iconForTitle(title: string) {
  return /office|work|company/i.test(title) ? Briefcase : Home;
}

interface MobileAddressesLayoutProps {
  addresses: UserAddress[];
}

export default function MobileAddressesLayout({ addresses }: MobileAddressesLayoutProps) {
  const [items, setItems] = useState(addresses);
  const [defaultId, setDefaultId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [editing, setEditing] = useState(false);

  const removeAddress = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header: ambient mesh gradient strictly at the top */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-40 blur-[80px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.5]" />
          <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.38] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.44]" />
          <div className="absolute -top-[140px] left-[32%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-45 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.16]" />
        </div>

        <div className="relative flex items-center gap-2.5 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <Link
            href="/profile"
            aria-label="Back to Profile"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </Link>
          <span className="flex-1 text-center text-[18px] font-semibold tracking-[-.035em]">Saved Addresses</span>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`h-11 min-w-11 flex-none px-2 text-[13.5px] tracking-[-.01em] transition-colors ${
              editing ? "font-semibold text-blue-700 dark:text-blue-400" : "font-medium text-slate-600 dark:text-slate-400"
            }`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {/* Address cards */}
      <div className="flex flex-col gap-3.5 px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        {items.map((item) => {
          const isDefault = item.id === defaultId;
          const Icon = iconForTitle(item.title);
          return (
            <div
              key={item.id}
              className={`rounded-[26px] bg-white p-5 dark:bg-slate-900 ${
                isDefault
                  ? "border-2 border-blue-500/30 shadow-[0_18px_40px_-28px_rgba(29,78,216,0.45)]"
                  : "border border-slate-100 shadow-[0_8px_22px_-20px_rgba(15,23,42,0.4)] dark:border-white/[.06]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 flex-none items-center justify-center rounded-[11px] ${
                      isDefault
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                        : "bg-slate-100 text-slate-600 dark:bg-white/[.07] dark:text-slate-400"
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="truncate text-[13.5px] font-semibold tracking-[-.02em]">{item.title}</span>
                </span>
                {isDefault && (
                  <span className="flex-none rounded-full border border-blue-700/[.18] bg-blue-50 px-2.5 py-1 text-[10.5px] font-semibold tracking-[-.01em] text-blue-700 dark:border-blue-400/20 dark:bg-blue-950 dark:text-blue-400">
                    Default
                  </span>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[14.5px] font-semibold leading-[1.35] tracking-[-.02em]">
                  {item.recipientName}
                </div>
                <div className="mt-[5px] text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
                  {item.fullAddress}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-slate-900/[.07] pt-3.5 dark:border-white/[.07]">
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefaultId(item.id)}
                    className="h-9 flex-none rounded-xl border-[1.5px] border-blue-700/35 bg-white px-3.5 text-xs font-semibold tracking-[-.01em] text-blue-700 transition-colors hover:border-blue-700/60 dark:bg-transparent dark:text-blue-400"
                  >
                    Set as Default
                  </button>
                )}
                <button
                  type="button"
                  className={`flex h-9 flex-none items-center justify-center gap-[7px] rounded-xl border border-slate-900/[.12] bg-white px-3.5 text-xs font-semibold tracking-[-.01em] text-slate-900 dark:border-white/[.14] dark:bg-transparent dark:text-slate-50 ${
                    isDefault ? "" : "ml-auto"
                  }`}
                >
                  <Pencil size={14} strokeWidth={1.9} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeAddress(item.id)}
                  aria-label={`Delete ${item.title}`}
                  className={`flex h-9 flex-none items-center justify-center gap-[7px] rounded-xl border text-xs font-semibold tracking-[-.01em] transition-colors ${
                    editing
                      ? "border-red-600/30 bg-red-50 px-3.5 text-red-600 dark:border-red-400/25 dark:bg-red-950/60 dark:text-red-400"
                      : "w-9 border-slate-900/[.12] bg-white text-slate-400 dark:border-white/[.14] dark:bg-transparent dark:text-slate-500"
                  }`}
                >
                  <Trash2 size={14} strokeWidth={1.9} />
                  {editing && "Delete"}
                </button>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="py-[70px] text-center text-[13.5px] text-slate-400 dark:text-slate-500">
            No saved addresses yet.
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl border border-slate-900/[.05] bg-slate-100 p-3.5 text-[11.5px] leading-[1.55] text-slate-500 dark:border-white/[.06] dark:bg-white/[.03] dark:text-slate-400">
          <Truck size={15} className="flex-none text-blue-700 dark:text-blue-400" strokeWidth={2} />
          Pressurized cylinders require a ground-floor delivery point with vehicle access.
        </div>
      </div>

      {/* Sticky Add New Address panel */}
      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-white/40 bg-white/78 px-4 pb-[env(safe-area-inset-bottom)] pt-3.5 shadow-[0_-16px_40px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/78">
        <button
          type="button"
          className="mb-3.5 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
        >
          <Plus size={17} strokeWidth={2.4} />
          Add New Address
        </button>
      </div>
    </div>
  );
}
