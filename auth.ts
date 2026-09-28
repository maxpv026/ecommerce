import type { FGasStatus } from "@/lib/generated/prisma/enums";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { consumeRecoveryCode, looksLikeRecoveryCode, verifyTotpForUser } from "@/lib/twoFactor";
import { ADMIN_LEGAL_NAME, roleForEmail } from "@/lib/rbac";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  // The adapter persists Google sign-ins (User/Account rows) to Postgres.
  // Credentials providers bypass it and manage their own lookups below —
  // Auth.js requires JWT sessions whenever a Credentials provider is
  // present, since credentials-authenticated users aren't created through
  // the adapter's OAuth-oriented flow.
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Code", type: "text" },
      },
      // Called by signIn("credentials", { email, password, code }) — the
      // second step of the OTP flow. Step 1 (lib/actions/otp.ts) already
      // created the user row and emailed the code; this is the only place
      // that actually verifies both the password and the code before a
      // session is issued.
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        const code = typeof credentials?.code === "string" ? credentials.code.trim() : undefined;
        if (!email || !password || !code) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) return null;

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return null;

        // Which second factor applies is a property of the account, not of
        // the request: an authenticator beats an emailed code, so a user who
        // has enrolled is never offered the weaker channel. Step 1
        // (lib/actions/otp.ts) skips the email for exactly these accounts,
        // so the `code` arriving here is whichever one they were asked for.
        if (user.isTwoFactorEnabled && user.twoFactorSecret) {
          // Either factor is accepted: six digits is the authenticator,
          // eight hex characters is a printed recovery code. They cannot be
          // confused — the lengths do not overlap.
          const usingRecovery = looksLikeRecoveryCode(code);
          const totp = usingRecovery
            ? await consumeRecoveryCode(prisma, user, code)
            : await verifyTotpForUser(prisma, user, code);
          if (totp.ok && usingRecovery) {
            console.warn(
              `auth: ${email} signed in with a RECOVERY CODE; ${"remaining" in totp ? totp.remaining : "?"} left.`
            );
          }
          if (!totp.ok) {
            // Deliberately indistinguishable to the caller. Saying "locked"
            // rather than "wrong" would confirm the password was right and
            // hand an attacker a progress signal.
            console.warn(`auth: TOTP refused for ${email}: ${totp.reason}`);
            return null;
          }
        } else {
          const validCode = await verifyAndConsumeOtp(email, code);
          if (!validCode) return null;
        }

        if (!user.emailVerified) {
          await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        // Sign-in only: pull the My Energy-specific profile fields once here
        // rather than on every request, since the User row is the source of
        // truth and authorize()/the adapter don't carry these through.
        // Never let a read failure break sign-in. Registration and email
        // verification both land here the moment the row is written, so a
        // transient miss (or a stale generated client after a schema change)
        // must degrade to defaults rather than throw the user out of the
        // flow that just created their account. The defaults below grant
        // nothing: fGasStatus falls back to NONE.
        const dbUser = user.email
          ? await prisma.user
              .findUnique({ where: { email: user.email } })
              .catch((error) => {
                console.error("auth: could not load the profile at sign-in:", error);
                return null;
              })
          : null;
        token.companyName = dbUser?.companyName ?? null;
        token.epaVerified = dbUser?.epaVerified ?? false;
        token.fGasStatus = dbUser?.fGasStatus ?? "NONE";
        token.isTwoFactorEnabled = dbUser?.isTwoFactorEnabled ?? false;
        token.locale = dbUser?.locale ?? "en";

        // The iron-clad admin rule: the role is DERIVED from ADMIN_EMAIL on
        // every sign-in, never trusted from the row. A matching email is
        // promoted, any non-matching account holding ADMIN (manual DB edit,
        // rotated ADMIN_EMAIL) is demoted before a session ever carries it.
        const role = roleForEmail(user.email);
        token.role = role;
        if (dbUser) {
          const patch: { role?: typeof role; name?: string } = {};
          if (dbUser.role !== role) patch.role = role;
          if (role === "ADMIN" && !dbUser.name) patch.name = ADMIN_LEGAL_NAME;
          if (Object.keys(patch).length > 0) {
            // The token already carries the derived role, so a failed write
            // only leaves the row to be repaired on the next sign-in — it
            // must not abort this one.
            const written = await prisma.user
              .update({ where: { id: dbUser.id }, data: patch })
              .then(() => true)
              .catch((error) => {
                console.error("auth: could not reconcile the role/name on the row:", error);
                return false;
              });
            if (written && patch.name) token.name = patch.name;
          }
        }
      }
      if (account) {
        token.provider = account.provider;
      }
      // useSession().update() lands here. Mutable profile flags that change
      // inside the app (F-Gas verification from the cart, company edits)
      // are re-read from the row so the session reflects them without a
      // fresh sign-in — the JWT is otherwise only populated at sign-in.
      if (trigger === "update") {
        const where = token.sub ? { id: token.sub } : token.email ? { email: token.email } : null;
        const dbUser = where
          ? await prisma.user
              .findUnique({
                where,
                select: {
                  name: true,
                  epaVerified: true,
                  fGasStatus: true,
                  companyName: true,
                  locale: true,
                  // So enabling 2FA unlocks the admin area without a re-login.
                  isTwoFactorEnabled: true,
                },
              })
              .catch((error) => {
                console.error("auth: could not refresh the session from the row:", error);
                return null;
              })
          : null;
        if (dbUser) {
          // `name` is in here because the profile UI reads it from the
          // session, not from the page's props: without it, editing your
          // name saves to the database and the card keeps the old one until
          // the next sign-in.
          token.name = dbUser.name ?? token.name;
          token.epaVerified = dbUser.epaVerified;
          token.fGasStatus = dbUser.fGasStatus;
          token.isTwoFactorEnabled = dbUser.isTwoFactorEnabled;
          token.companyName = dbUser.companyName;
          token.locale = dbUser.locale;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        session.user.email = (token.email as string | undefined) ?? session.user.email;
        session.user.name = (token.name as string | undefined) ?? session.user.name;
        session.user.provider = token.provider as string | undefined;
        session.user.companyName = (token.companyName as string | null | undefined) ?? null;
        // fGasStatus is the source of truth; the two booleans are kept as
        // derived mirrors so nothing reading them can disagree with it.
        session.user.fGasStatus = (token.fGasStatus as FGasStatus | undefined) ?? "NONE";
        session.user.epaVerified = session.user.fGasStatus === "VERIFIED";
        session.user.isFGasVerified = session.user.fGasStatus === "VERIFIED";
        session.user.locale = (token.locale as string | undefined) ?? "en";
        // Absent role (pre-RBAC session tokens) fails closed to USER.
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
        session.user.isTwoFactorEnabled = token.isTwoFactorEnabled === true;
      }
      return session;
    },
  },
});
