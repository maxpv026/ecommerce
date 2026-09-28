import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import Footer from "@/components/Footer";
import AIChatWidgetMount from "@/components/AIChatWidgetMount";
import MobileAppShell from "@/components/MobileAppShell";
import { CartCountProvider } from "@/components/CartCountProvider";
import AuthProvider from "@/components/AuthProvider";
import ToastProvider from "@/components/ToastProvider";
import { routing } from "@/i18n/routing";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Energy — Premium Refrigerants",
  description: "Certified virgin and reclaimed refrigerant cylinders for commercial HVAC, smartly matched to your unit.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the mobile app-shell screens read real safe-area insets
  // (env(safe-area-inset-bottom)) behind the iPhone home indicator.
  viewportFit: "cover",
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("halocore-theme");
    var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Tells next-intl which locale this render is for. Without it, getMessages()
  // below falls back to reading the locale off the incoming request headers,
  // and reading request headers is what makes a render dynamic — so every
  // page under this layout was server-rendered on demand, including ones with
  // no user-specific content at all. Pages still have to opt in individually
  // (each calls setRequestLocale too), but nothing can be static until this
  // line exists.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* Color intentionally omitted here: globals.css's `body { background:
          var(--background); color: var(--foreground); }` already applies
          the exact light/dark values unconditionally — Tailwind color
          classes here would just be redundant (and, being generic
          slate/gray, wrong for dark mode's "rich obsidian" palette). */}
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <CartCountProvider>
              <MobileAppShell>{children}</MobileAppShell>
              <Footer />
              <AIChatWidgetMount />
              <ToastProvider />
            </CartCountProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
