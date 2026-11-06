"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Headset, Loader2, Search, UserRound } from "lucide-react";
import ProductCard from "../ProductCard";
import type { StoreProduct } from "@/lib/data";
import type { SupportUIMessage } from "@/lib/chatSession";

// See AIChatWidget: the markdown parser loads only once a reply exists.
const Markdown = dynamic(() => import("react-markdown"), { ssr: false });

const BUBBLE_AI =
  "rounded-[16px_16px_16px_5px] border border-slate-900/[.07] bg-white/92 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-white/[.08] dark:bg-white/[.06] dark:text-slate-50 [&_p]:m-0 [&_p+p]:mt-2 [&_code]:rounded [&_code]:bg-slate-900/[.06] [&_code]:px-1 [&_code]:py-[1px] [&_code]:text-[12px] dark:[&_code]:bg-white/10";

/**
 * One message of the support chat, part by part. The assistant's tool calls
 * render as real UI rather than prose about it:
 *   tool-searchCatalog   → a grid of the catalog's own ProductCards
 *   tool-escalateToHuman → the handoff notice (fixed copy, not model text)
 * A reply typed by the team (metadata.author "human_agent") is styled as a
 * person, so nobody mistakes it for the bot.
 */
export default function SupportMessage({
  message,
  cartSkus,
  onAddToCart,
  onNotify,
}: {
  message: SupportUIMessage;
  cartSkus: ReadonlySet<string>;
  onAddToCart: (product: StoreProduct) => void;
  onNotify: (product: StoreProduct) => void;
}) {
  const t = useTranslations("SupportChat");
  const fromUser = message.role === "user";
  const fromTeam = message.metadata?.author === "human_agent";

  return (
    <div className={`flex flex-col gap-2 ${fromUser ? "items-end" : "items-start"}`} data-chat-message={message.metadata?.author ?? message.role}>
      {fromTeam && (
        <span className="flex items-center gap-1.5 pl-1 text-[11px] font-semibold text-primary dark:text-blue-300">
          <Headset size={12} strokeWidth={2.2} />
          {t("teamLabel")}
        </span>
      )}
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;
        if (part.type === "text") {
          if (!part.text.trim()) return null;
          if (fromUser) {
            return (
              <div key={key} className="max-w-[84%] rounded-[16px_16px_5px_16px] bg-primary px-3.5 py-[11px] text-[13px] leading-[1.55] text-primary-foreground">
                {part.text}
              </div>
            );
          }
          return (
            <div
              key={key}
              data-team-reply={fromTeam ? "" : undefined}
              className={`max-w-[88%] px-3.5 py-[11px] text-[13px] leading-[1.55] tracking-[-.005em] ${
                fromTeam ? "rounded-[16px_16px_16px_5px] bg-accent text-foreground ring-1 ring-primary/15 dark:ring-blue-400/20 whitespace-pre-line" : BUBBLE_AI
              }`}
            >
              {fromTeam ? part.text : <Markdown>{part.text}</Markdown>}
            </div>
          );
        }

        if (part.type === "tool-searchCatalog") {
          if (part.state === "output-available") {
            const products = ((part.output as { products?: StoreProduct[] })?.products ?? []).slice(0, 4);
            if (products.length === 0) return null;
            return (
              <div key={key} className="grid w-full grid-cols-2 gap-2" data-chat-products>
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    variant="compact"
                    inCart={cartSkus.has(p.sku)}
                    onAddToCart={onAddToCart}
                    onNotify={onNotify}
                    imageSizes="160px"
                    animateIn={false}
                  />
                ))}
              </div>
            );
          }
          if (part.state === "output-error") return null;
          return (
            <span key={key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Search size={12} strokeWidth={2.2} />
              {t("searching")}
              <Loader2 size={12} className="animate-spin" />
            </span>
          );
        }

        if (part.type === "tool-escalateToHuman" && part.state === "output-available") {
          return (
            <div
              key={key}
              data-handoff-notice
              className="flex max-w-[92%] items-start gap-2.5 rounded-[14px] bg-accent px-3.5 py-3 text-[12.5px] leading-[1.5] text-foreground ring-1 ring-primary/15 dark:ring-blue-400/20"
            >
              <UserRound size={15} strokeWidth={2.2} className="mt-0.5 flex-none text-primary dark:text-blue-300" />
              <span>{t("handoffNotice")}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
