"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ChevronDown, Heart, LayoutDashboard, Leaf, LogOut, Settings, ShieldCheck, ShoppingCart, User } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import HeaderSearch from "./HeaderSearch";
import HeaderLanguageSwitcher from "./HeaderLanguageSwitcher";
import { initialsFrom } from "@/lib/initials";
import { Avatar } from "./AvatarUploader";
import { useCartStore, selectCartCount } from "@/lib/store/cart";
import { useFavoritesCount } from "@/lib/hooks/useFavorite";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { RECORDS_LINKS, type RecordsIconKey } from "@/lib/profileRecords";
import { isStaffRole } from "@/lib/rbac";

interface NavLink {
  key: string;
  href: string;
  matchPrefix?: string;
}

const NAV_LINKS: NavLink[] = [
  { key: "categories", href: "/categories" },
  { key: "productList", href: "/products" },
  // /hub is in the public nav on purpose. It is not an account page: the rate
  // board and the market intelligence are the same for everyone, and the
  // personalised half degrades to a sign-in prompt and empty chart states
  // rather than breaking. Putting it behind a session would hide the best
  // reason a new buyer has to look at this site.
  { key: "marketHub", href: "/hub" },
  // Public SDS library + the F-Gas rules — named for exactly what it holds,
  // so it can't be mistaken for the account's own "Records & Compliance".
  { key: "navSds", href: "/compliance/sds", matchPrefix: "/compliance" },
  // The "Compliance" item used to sit here, pointing at /compliance/sds.
  // It came out because one header label reading "Compliance" and an account
  // group reading "Records & Compliance" were two different things: public
  // product datasheets, and a customer's own invoices and carbon figures.
  //
  // Nothing is stranded by removing it — the public SDS library is still
  // linked from the footer, the categories grid, DesktopHome and every PDP,
  // and it stays public (no session required), which is the point of it.
];

// The desktop profile dashboard is a single page with anchored sections, so
// Orders/Settings deep-link to their section anchors rather than the
// mobile-only subroutes.
/**
 * Icons for the Records group; the list itself lives in lib/profileRecords.
 *
 * "Documents & certificates" came out of this menu — the group points only at
 * the consolidated carbon record now. /profile/docs itself is untouched and
 * still reached from the dashboard's Documents tab and the mobile surfaces.
 */
const RECORD_ICONS: Record<RecordsIconKey, typeof LayoutDashboard> = {
  carbon: Leaf,
};

// Dashboard only. "Orders" and "Settings" were anchor links into the desktop
// dashboard's own sections (/profile#orders, /profile#security) — the account
// menu duplicating the page it lands on. Both are reachable from the dashboard
// sidebar, so the menu no longer carries them.
const MENU_ITEMS = [
  { key: "menuDashboard", href: "/profile", icon: LayoutDashboard },
  { key: "menuSettings", href: "/profile/settings", icon: Settings },
] as const;

interface HeaderProps {
  /**
   * Optional mirror of the search term for pages that track it. The search
   * box owns the value — it seeds from `?search=` and drives its own
   * dropdown — so nothing has to be passed in for search to work.
   */
  onQueryChange?: (value: string) => void;
  onSignInClick: () => void;
}

export default function Header({ onQueryChange, onSignInClick }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Header");
  const tAuth = useTranslations("Auth");
  const tRecords = useTranslations("Records");
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  // Any staff role sees the way into /admin (lib/rbac); what they can do there is decided on the server.
  const isAdmin = isAuthenticated && isStaffRole(session?.user?.role);

  // Cart badge: read straight from the persisted store so every add/remove
  // anywhere in the app updates it instantly. Hydration-gated because the
  // server renders 0 while localStorage may hold a persisted cart.
  const cartCount = useCartStore(selectCartCount);
  const hydrated = useHydrated();
  const shownCount = hydrated ? cartCount : 0;
  // Favorites badge: the shared favourites store, loaded once per account,
  // so hearting anything on the page moves this number at once.
  const favoritesCount = useFavoritesCount();

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

  const epaVerified = isAuthenticated && Boolean(session?.user?.epaVerified);
  // Shared by every control in the dock: one height, one radius, one border.
  const CONTROL = "flex h-9 flex-none items-center rounded-xl border text-[13px] font-medium transition-colors";
  const CONTROL_IDLE = "border-slate-200 bg-white/70 text-slate-800 hover:border-slate-300 hover:bg-white dark:border-white/[.1] dark:bg-white/[.03] dark:text-slate-100 dark:hover:border-white/20 dark:hover:bg-white/[.06]";
  const CAPSULE_ITEM = "flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-white hover:shadow-[0_1px_2px_rgba(15,23,42,.08)] dark:text-slate-200 dark:hover:bg-white/[.08]";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-[#0B0F17]/85" data-header>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-8">
        <Link href="/" className="flex flex-none items-center gap-2" data-header-brand>
          <span className="block h-[15px] w-[15px] rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
          <span className="text-[17px] font-semibold tracking-[-.035em]">My Energy</span>
        </Link>

        {/* Navigation track: the active route sits on a surface, not bare text. */}
        <nav className="ml-2 hidden flex-none items-center gap-0.5 min-[1120px]:flex" data-header-nav>
          {NAV_LINKS.map(({ key, href, matchPrefix }) => {
            const active = pathname.startsWith(matchPrefix ?? href);
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? "page" : undefined}
                data-nav-item={key}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium tracking-[-.01em] transition-colors ${
                  active
                    ? "bg-slate-100 text-slate-900 dark:bg-white/[.07] dark:text-white"
                    : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[.04] dark:hover:text-white"
                }`}
              >
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
          <HeaderSearch onQueryChange={onQueryChange} />

          {/* Language + theme: one capsule */}
          <div className="flex flex-none items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50/60 p-0.5 dark:border-white/[.08] dark:bg-white/[.02]" data-header-capsule>
            <HeaderLanguageSwitcher triggerClassName={`${CAPSULE_ITEM} disabled:opacity-60`} />
            <span aria-hidden className="h-4 w-px bg-slate-200 dark:bg-white/[.1]" />
            <ThemeToggle className={`${CAPSULE_ITEM} w-8 justify-center px-0`} iconSize={15} />
          </div>

          {isAuthenticated ? (
            <div ref={menuRef} className="relative flex-none">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={t("accountMenuAria")}
                data-header-account
                className={`${CONTROL} ${CONTROL_IDLE} gap-2 pl-1 pr-2.5`}
              >
                <span className="relative flex-none">
                  <Avatar
                    avatarUrl={session?.user?.image ?? null}
                    initials={initialsFrom(session?.user?.name ?? session?.user?.email ?? "?")}
                    size={26}
                    className="text-[10.5px]"
                  />
                  {epaVerified && (
                    <span
                      title={t("fgasVerifiedDot")}
                      data-fgas-dot
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#0B0F17]"
                    />
                  )}
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

                    {/* Admins only. This decides visibility, not access: /admin
                        is enforced by proxy.ts and, on every page and action,
                        by guardAdmin/requireAdmin against the database row.
                        A non-admin who types the URL is still turned away. */}
                    {isAdmin && (
                      <div className="border-b border-slate-900/[.07] py-1 dark:border-white/[.08]">
                        <Link
                          role="menuitem"
                          href="/admin"
                          data-admin-link
                          onClick={() => setMenuOpen(false)}
                          className="group flex items-center gap-2.5 rounded-[11px] bg-blue-700/[.06] px-3 py-2 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-700/[.11] dark:bg-blue-400/[.09] dark:text-blue-300 dark:hover:bg-blue-400/[.15]"
                        >
                          <ShieldCheck size={15} strokeWidth={2.2} />
                          <span className="min-w-0 flex-1">
                            <span className="block">{t("menuAdmin")}</span>
                            {/* The proxy sends an admin without an
                                authenticator to set one up; saying so here
                                makes that redirect unsurprising. */}
                            {!session?.user?.isTwoFactorEnabled && (
                              <span className="mt-0.5 block text-[10.5px] font-medium text-blue-700/70 dark:text-blue-300/70">
                                {t("menuAdmin2fa")}
                              </span>
                            )}
                          </span>
                          <span className="rounded-full border border-blue-700/25 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[.08em] dark:border-blue-300/30">
                            {t("menuAdminBadge")}
                          </span>
                        </Link>
                      </div>
                    )}

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

                    {/* Records & Compliance — the enterprise views that were
                        previously reachable only by typing the URL. One list,
                        shared with the profile pages via lib/profileRecords. */}
                    <div className="border-t border-slate-900/[.07] py-1 dark:border-white/[.08]">
                      <div className="px-3 pb-1 pt-1.5 text-[9.5px] tracking-[.1em] text-slate-400 dark:text-slate-500">
                        {tRecords("title").toUpperCase()}
                      </div>
                      {RECORDS_LINKS.map((link) => {
                        const Icon = RECORD_ICONS[link.icon];
                        return (
                          <Link
                            key={link.id}
                            role="menuitem"
                            href={link.href}
                            data-records-link={link.id}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-900/[.05] hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[.07] dark:hover:text-slate-50"
                          >
                            <Icon size={15} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                            {tRecords(link.labelKey)}
                          </Link>
                        );
                      })}
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
              data-header-signin
              className={`${CONTROL} ${CONTROL_IDLE} gap-[7px] px-3`}
            >
              <User size={15} strokeWidth={2} />
              {t("signIn")}
            </button>
          )}
          {/* Signed out it still goes to /profile/favorites, which sends a
              guest to sign in and back. */}
          <Link
            href="/profile/favorites"
            aria-label={favoritesCount > 0 ? t("favoritesAriaCount", { count: favoritesCount }) : t("favoritesAria")}
            title={t("favoritesAria")}
            data-header-favorites
            className={`${CONTROL} ${CONTROL_IDLE} gap-1.5 px-2.5`}
          >
            <Heart size={16} strokeWidth={2} fill={favoritesCount > 0 ? "currentColor" : "none"} className={favoritesCount > 0 ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"} />
            {favoritesCount > 0 && (
              <span data-favorites-badge className="text-[12.5px] font-semibold tabular-nums">
                {favoritesCount > 99 ? "99+" : favoritesCount}
              </span>
            )}
          </Link>
          {/* Cart: the count is inline, and the button turns the brand blue once it holds something. */}
          <Link
            href="/cart"
            aria-label={t("cartAria", { count: shownCount })}
            data-header-cart
            data-cart-count={shownCount}
            className={`${CONTROL} gap-2 px-3 font-semibold ${
              shownCount > 0
                ? "border-transparent bg-blue-700 text-white hover:bg-blue-800"
                : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            }`}
          >
            <ShoppingCart size={16} strokeWidth={2} />
            <span>{t("cart")}</span>
            {shownCount > 0 && (
              <span className="rounded-md bg-white/20 px-1.5 text-[12px] tabular-nums" data-cart-badge>
                {shownCount > 99 ? "99+" : shownCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
