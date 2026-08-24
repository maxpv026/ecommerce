"use client";

import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { MOBILE_NOTIFICATIONS } from "@/lib/mobileNotifications";

export default function MobileNotificationsLayout() {
  const router = useRouter();
  const [readIds, setReadIds] = useState<string[]>([]);

  const markRead = (id: string) => {
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const unreadCount = MOBILE_NOTIFICATIONS.filter((n) => n.unread && !readIds.includes(n.id)).length;

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
          <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">Notifications</span>
          <span className="w-11 flex-none" />
        </div>

        {unreadCount > 0 && (
          <div className="relative px-4 pb-1 text-center text-[12.5px] text-slate-500 dark:text-slate-400">
            {unreadCount} unread
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 pb-[calc(120px+env(safe-area-inset-bottom))] pt-4">
        {MOBILE_NOTIFICATIONS.map((notification) => {
          const isUnread = notification.unread && !readIds.includes(notification.id);
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => markRead(notification.id)}
              className="mx-4 flex items-start gap-3.5 rounded-3xl bg-white p-5 text-left shadow-sm transition-colors dark:bg-slate-900"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                <notification.icon size={19} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13.5px] font-semibold leading-[1.3] tracking-[-.02em]">
                    {notification.title}
                  </span>
                  {isUnread && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-700" />}
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
                  {notification.body}
                </span>
                <span className="mt-2 block text-[11px] text-slate-400 dark:text-slate-500">{notification.time}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
