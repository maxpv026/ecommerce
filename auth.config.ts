import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the full config in auth.ts. middleware.ts runs in the
// Edge runtime, which can't load Prisma Client or bcryptjs (both need
// Node.js-only APIs) — JWT verification alone doesn't need the providers or
// database adapter, so middleware only needs this slice.
export const authConfig = {
  pages: { signIn: "/auth" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    // Lets proxy.ts read req.auth.user.role from the JWT. auth.ts's full
    // config overrides this callbacks object entirely with its richer one —
    // this copy exists solely for the Edge middleware instance.
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
        session.user.isFGasVerified = Boolean(token.epaVerified);
        // Needed by proxy.ts's admin gate. Without it `req.auth.user`
        // carries no 2FA claim on the Edge, the gate reads undefined, and
        // every admin — enrolled or not — is bounced out of /admin.
        session.user.isTwoFactorEnabled = token.isTwoFactorEnabled === true;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
