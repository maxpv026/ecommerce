import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      /** Prisma User.id — unset for OTP sessions with no backing DB row. */
      id?: string;
      /** Which provider the current session was established with. */
      provider?: string;
      /** Mirrors Prisma User.companyName. */
      companyName?: string | null;
      /** Mirrors Prisma User.epaVerified. */
      epaVerified?: boolean;
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
    epaVerified?: boolean;
    locale?: string;
  }
}
