"use client";

import dynamic from "next/dynamic";
import { usePathname } from "@/i18n/navigation";
import { ASSISTANT_VISIBLE_PATHS } from "@/lib/aiChatEvents";

/**
 * Decides whether the AI assistant is needed on this route before loading it.
 *
 * The widget renders on two routes — Home and the catalogue — but it lived in
 * the locale layout as a direct import, so its dependencies (`ai`,
 * `@ai-sdk/react`, and through it the chat transport) were downloaded and
 * parsed on every page of the app: checkout, profile, legal text, all of it.
 * The launcher is a floating button; nothing about it needs to be in the
 * first byte of a page it does not appear on.
 *
 * Splitting it here rather than inside the widget is what actually saves the
 * bytes: a `dynamic()` call inside AIChatWidget would still require that
 * module — and its imports — to load first.
 *
 * Note where the route list comes from: lib/aiChatEvents, which has no
 * dependencies. Importing it from AIChatWidget instead — even as a single
 * const — drags the whole module graph back in and silently undoes all of
 * this. Verified by measuring, not assumed.
 *
 * `ssr: false` because the widget is client-only regardless (it keys off
 * pathname and local state), and because a floating launcher appearing on
 * hydration shifts no layout.
 */
const AIChatWidget = dynamic(() => import("./AIChatWidget"), { ssr: false });

export default function AIChatWidgetMount() {
  const pathname = usePathname();
  if (!ASSISTANT_VISIBLE_PATHS.includes(pathname)) return null;
  return <AIChatWidget />;
}
