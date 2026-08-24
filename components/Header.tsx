"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Package, Search, Settings, ShoppingCart, User } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import HeaderLanguageSwitcher from "./HeaderLanguageSwitcher";
import { initialsFrom } from "@/lib/initials";
import { useCartStore, selectCartCount } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";

interface NavLink {
  key: string;
  href: string;
  matchPrefix?: string;
}

const NAV_LINKS: NavLink[] = [
  { key: "categories", href: "/categories" },
  { key: "productList", href: "/products" },
  { key: "equipment", href: "/#grid" },
  { key: "compliance", href: "/compliance/sds", matchPrefix: "/compliance" },
];

// The desktop profile dashboard is a single page with anchored sections, so
// Orders/Settings deep-link to their section anchors rather than the
// mobile-only subroutes.
const MENU_ITEMS = [
  { key: "menuDashboard", href: "/profile", icon: LayoutDashboard },
  { key: "menuOrders", href: "/profile#orders", icon: Package },
  { key: "menuSettings", href: "/profile#security", icon: Settings },
] as const;

interface HeaderProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSignInClick: () => void;
}

export default function Header({ query, onQueryChange, onSignInClick }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Header");
  const tAuth = useTranslations("Auth");
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";

  // Cart badge: read straight from the persisted store so every add/remove
  // anywhere in the app updates it instantly. Hydration-gated because the
  // server renders 0 while localStorage may hold a persisted cart.
  const cartCount = useCartStore(selectCartCount);
  const hydrated = useHydrated();
  const shownCount = hydrated ? cartCount : 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut({ redirect: false });
    setMenuOpen(false);
    setSigningOut(false);
    toast.success(tAuth("toastSignedOut"));
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/[.07] bg-white/75 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
      <div className="mx-auto flex h-[70px] max-w-[1320px] items-center gap-7 px-8">
        <Link href="/" className="flex flex-none items-center gap-[9px]">
          <span className="block h-[15px] w-[15px] rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
          <span className="text-[19px] font-semibold tracking-[-.035em]">My Energy</span>
        </Link>

        <nav className="ml-3.5 hidden flex-none gap-6.5 min-[1120px]:flex">
          {NAV_LINKS.map(({ key, href, matchPrefix }) => {
            const active = href !== "/#grid" && pathname.startsWith(matchPrefix ?? href);
            return (
              <Link
                key={key}
                href={href}
                className={
                  active
                    ? "text-[13.5px] font-semibold tracking-[-.01em] text-slate-900 dark:text-slate-50"
                    : "text-[13.5px] tracking-[-.01em] text-slate-600 hover:text-blue-700 dark:text-ink-muted dark:hover:text-blue-400"
                }
              >
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5">
          <div className="flex h-[38px] w-[180px] max-w-[280px] flex-1 items-center gap-2 rounded-full border border-slate-900/[.12] bg-slate-50 px-3.5 dark:border-hairline-strong dark:bg-surface">
            <Search size={15} className="shrink-0 text-slate-500 dark:text-ink-muted" strokeWidth={2} />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-ink-muted"
            />
          </div>

          <div className="flex flex-none items-center gap-1.5">
            <HeaderLanguageSwitcher />
            <ThemeToggle />
          </div>

          {isAuthenticated ? (
            <div ref={menuRef} className="relative flex-none">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={t("accountMenuAria")}
                className="flex h-[38px] flex-none items-center gap-2 rounded-full border border-slate-900/[.12] bg-white pl-[5px] pr-3 text-[13px] font-medium text-slate-900 transition-colors hover:border-slate-900/30 dark:border-hairline-strong dark:bg-surface dark:text-slate-50 dark:hover:border-white/30"
              >
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-700 text-[11px] font-semibold text-white">
                  {initialsFrom(session?.user?.name ?? session?.user?.email ?? "?")}
                </span>
                <span className="hidden max-w-[120px] truncate min-[1120px]:block">
                  {session?.user?.name?.split(" ")[0] ?? session?.user?.email?.split("@")[0]}
                </span>
                <ChevronDown
                  size={14}
                  strokeWidth={2.2}
                  className={`text-slate-400 transition-transform duration-200 dark:text-ink-muted ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute right-0 top-[calc(100%+10px)] w-[232px] origin-top-right overflow-hidden rounded-[18px] border border-white/75 bg-white/85 p-1.5 shadow-[0_24px_56px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-surface/95 dark:shadow-[0_24px_56px_-20px_rgba(0,0,0,0.7)]"
                  >
                    <div className="border-b border-slate-900/[.07] px-3 pb-2.5 pt-2 dark:border-white/[.08]">
                      <div className="truncate text-[13px] font-semibold tracking-[-.01em]">
                        {session?.user?.name ?? session?.user?.email}
                      </div>
                      {session?.user?.name && (
                        <div className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-ink-muted">
                          {session?.user?.email}
                        </div>
                      )}
                    </div>

                    <div className="py-1">
                      {MENU_ITEMS.map(({ key, href, icon: Icon }) => (
                        <Link
                          key={key}
                          role="menuitem"
                          href={href}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-900/[.05] hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[.07] dark:hover:text-slate-50"
                        >
                          <Icon size={15} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                          {t(key)}
                        </Link>
                      ))}
                    </div>

                    <div className="border-t border-slate-900/[.07] pt-1 dark:border-white/[.08]">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2 text-left text-[13px] font-medium text-red-600 transition-colors hover:bg-red-600/[.06] disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-400/[.08]"
                      >
                        <LogOut size={15} strokeWidth={2} />
                        {t("menuSignOut")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInClick}
              className="flex h-[38px] flex-none items-center gap-[7px] rounded-full border border-slate-900/[.12] bg-white px-[15px] text-[13px] font-medium text-slate-900 transition-colors hover:border-slate-900/30 dark:border-hairline-strong dark:bg-surface dark:text-slate-50 dark:hover:border-white/30"
            >
              <User size={15} strokeWidth={2} />
              {t("signIn")}
            </button>
          )}
          <Link
            href="/cart"
            aria-label="Open cart"
            className="relative flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-slate-900/[.12] bg-slate-900 text-white transition-colors hover:bg-slate-800 dark:border-hairline-strong dark:bg-invert dark:text-invert-ink dark:hover:bg-slate-200"
          >
            <ShoppingCart size={16} strokeWidth={2} />
            {shownCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-blue-700 px-[5px] text-[10.5px] font-semibold text-white dark:border-canvas">
                {shownCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
