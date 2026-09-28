import type { DefaultSession } from "next-auth";
import type { FGasStatus } from "@/lib/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      /** Prisma User.id — unset for OTP sessions with no backing DB row. */
      id?: string;
      /** Which provider the current session was established with. */
      provider?: string;
      /** Mirrors Prisma User.companyName. */
      companyName?: string | null;
      /**
       * Where the buyer's F-Gas certificate stands. The source of truth for
       * every purchase gate: only "VERIFIED" — set by an admin, never by the
       * upload — unlocks checkout.
       */
      fGasStatus?: FGasStatus;
      /** Derived mirror of `fGasStatus === "VERIFIED"`. */
      epaVerified?: boolean;
    isTwoFactorEnabled?: boolean;
      /** Whether an authenticator app is enrolled. Gates the admin area. */
      isTwoFactorEnabled?: boolean;
      /** Derived mirror of `fGasStatus === "VERIFIED"`. */
      isFGasVerified?: boolean;
      /** Mirrors Prisma User.locale — the user's last-saved UI language. */
      locale?: string;
      /** RBAC role — "ADMIN" only for the ADMIN_EMAIL account. */
      role?: "USER" | "ADMIN";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
    role?: "USER" | "ADMIN";
    companyName?: string | null;
    fGasStatus?: FGasStatus;
    epaVerified?: boolean;
    locale?: string;
  }
}
