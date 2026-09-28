"use client";

import { useState, type ReactNode } from "react";
import Header from "./Header";
import AuthModal from "./AuthModal";

/**
 * The app header for pages that were rendering without one.
 *
 * Several routes are mobile-first layouts whose page component's ONLY child
 * was wrapped in `block md:hidden`. Above the md breakpoint that renders
 * nothing at all — the "white screen": a document containing just the footer.
 * Five pages had it (/profile/docs, /profile/addresses, /profile/security,
 * /notifications, /search), each reported 230 characters of visible text on
 * desktop, all of it the footer.
 *
 * The layouts themselves are self-contained phone designs with their own
 * title bar, so the fix is to stop hiding them on desktop and give them the
 * app header plus a readable column.
 *
 * Header takes a required `onSignInClick` and therefore needs an AuthModal to
 * open, which is why this exists instead of a bare `<Header />`: three pages
 * would otherwise each carry the same piece of modal state.
 *
 * Desktop only, deliberately. On mobile these pages have their own bar and the
 * global bottom nav; a second sticky header would eat a third of a phone
 * screen and collide with the one the page already draws.
 */
export default function AppChrome({ children }: { children: ReactNode }) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      {/* `md:contents`, not `md:block`. Header is `sticky top-0`, and sticky
          only holds while its CONTAINING BLOCK is on screen — a wrapper that
          is merely header-height unsticks it immediately, so the header
          scrolled away here while staying pinned everywhere else in the app.
          `display: contents` removes this box on desktop so the header's
          containing block is the page again; `hidden` still takes it out on
          mobile, where the page draws its own bar. */}
      <div className="hidden md:contents">
        <Header onSignInClick={() => setAuthOpen(true)} />
      </div>
      {children}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
