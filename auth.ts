import type { FGasStatus, ThemePreference } from "@/lib/generated/prisma/enums";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import { checkPassword } from "@/lib/loginThrottle";
import { readRestamp, revokedBefore, sessionAnchor, sessionStillValid } from "@/lib/sessionRevocation";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { consumeRecoveryCode, looksLikeRecoveryCode, verifyTotpForUser } from "@/lib/twoFactor";
import { ADMIN_LEGAL_NAME, roleForEmail } from "@/lib/rbac";
import { createGoogleTwoFactorChallenge, verifyGoogleTwoFactorChallenge } from "@/lib/googleTwoFactor";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
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
      // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are the v5 names. The old
      // GOOGLE_CLIENT_* names stay as a fallback, but with `||`, not `??`:
      // they were present-but-empty in .env.local, and an explicit "" here
      // overrode the real values and sent Google a request with no client_id.
      clientId: process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      // Lets "Continue with Google" sign in to an account first created by
      // email — otherwise NextAuth refuses (OAuthAccountNotLinked), and here
      // almost every account was created by email. Safe only with the two
      // conditions in callbacks.signIn below: Google must have verified the
      // address, and accounts protected by an authenticator are excluded.
      allowDangerousEmailAccountLinking: true,
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

        // Same per-account lockout as step 1 (lib/loginThrottle): this
        // endpoint is reachable directly, so it must count guesses too.
        if ((await checkPassword(user, password)) !== "ok") return null;

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
    // Step 2 of a Google sign-in on an account with an authenticator — the
    // only way the paused login becomes a session. Requires BOTH the signed
    // challenge Google's step produced (passed by completeGoogleTwoFactor
    // from its HttpOnly cookie) and a valid TOTP or recovery code. The
    // lockout and replay guards are the same ones the password route uses.
    Credentials({
      id: "google-2fa",
      name: "Google two-factor",
      credentials: { challenge: { type: "text" }, code: { type: "text" } },
      async authorize(credentials) {
        const challenge = verifyGoogleTwoFactorChallenge(typeof credentials?.challenge === "string" ? credentials.challenge : null);
        const code = typeof credentials?.code === "string" ? credentials.code.trim() : "";
        if (!challenge || !code) return null;

        const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
        // Re-checked, not assumed: 2FA could have been switched off (or the
        // account deleted) in the five minutes since the challenge.
        if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) return null;

        const check = looksLikeRecoveryCode(code)
          ? await consumeRecoveryCode(prisma, user, code)
          : await verifyTotpForUser(prisma, user, code);
        if (!check.ok) {
          console.warn(`auth: Google 2FA refused for ${user.email ?? user.id}: ${check.reason}`);
          return null;
        }

        // First Google sign-in for this account: link it now, so the next
        // one finds it by Google id. Never re-points a Google id that
        // already belongs to a different account.
        await prisma.account
          .upsert({
            where: { provider_providerAccountId: { provider: "google", providerAccountId: challenge.providerAccountId } },
            create: { userId: user.id, type: "oidc", provider: "google", providerAccountId: challenge.providerAccountId },
            update: {},
          })
          .catch((error) => console.error("auth: could not link the Google account after 2FA:", error));

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return true;

      // Linking by email trusts that whoever signs in with Google owns the
      // address. Only true when Google itself says it verified it.
      if (profile?.email_verified !== true) return "/auth?error=google-unverified";

      // An account with an authenticator must still pass it. Google has
      // proven who this is, so instead of allowing the login (no session
      // yet, no account link yet) we pause it: a short-lived signed
      // challenge goes to /api/two-factor/start, and only the "google-2fa"
      // provider below can turn it into a session, after a valid code.
      // See lib/googleTwoFactor for why this isn't a half-verified JWT.
      const linked = await prisma.account
        .findUnique({
          where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
          select: { user: { select: { id: true, isTwoFactorEnabled: true } } },
        })
        .catch(() => null);
      const email = (profile.email ?? user.email)?.trim();
      // Not yet linked: the account Google will be linked to, found by email.
      const byEmail =
        !linked?.user && email
          ? await prisma.user
              .findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, isTwoFactorEnabled: true, emailVerified: true, password: true } })
              .catch(() => null)
          : null;
      const target = linked?.user ?? byEmail;
      if (target?.isTwoFactorEnabled) {
        const challenge = createGoogleTwoFactorChallenge({ userId: target.id, providerAccountId: account.providerAccountId });
        return `/api/two-factor/start?c=${encodeURIComponent(challenge)}`;
      }

      // Pre-hijacking guard. Registering never needs to prove the address
      // (the row is written before the emailed code is entered), so anyone
      // can create an unverified row for someone else's email, with a
      // password they know, and wait for its owner to "Continue with
      // Google" into it. Google has just proven ownership, so the
      // unverified row becomes the owner's: its password — set by whoever
      // registered it, possibly not them — is discarded, and the address is
      // marked verified. Affects only rows that never completed a sign-in.
      if (byEmail && !byEmail.emailVerified) {
        const cleared = await prisma.user
          .updateMany({ where: { id: byEmail.id, emailVerified: null }, data: { password: null, emailVerified: new Date() } })
          .catch((error) => {
            console.error("auth: could not clear the unverified account before linking Google:", error);
            return null;
          });
        // Linking into an account whose foreign password we failed to remove
        // is exactly the takeover this prevents: refuse instead.
        if (!cleared) return "/auth?error=OAuthAccountNotLinked";
        if (byEmail.password) console.warn(`auth: discarded the password of unverified account ${byEmail.id} on its first Google sign-in`);
      }
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        // When this holder last proved who they are. Compared against
        // passwordChangedAt on every later read (lib/sessionRevocation).
        token.authTime = Date.now();
      } else if (token.sub) {
        // ── Revocation on password change ──
        // The device that just changed the password re-stamps its own
        // session (lib/actions/password → unstable_update) with a stamp only
        // the server can mint; every other token issued before the change is
        // refused, and returning null makes Auth.js clear its cookie.
        const anchor = await sessionAnchor(token.sub).catch((error) => {
          // A transient database error must not sign everyone out (null
          // deletes the cookie): fail open for this one read, loudly.
          console.error("auth: could not check the session against the account:", error);
          return undefined;
        });
        if (anchor !== undefined) {
          const restamped = trigger === "update" ? readRestamp((session as { restamp?: unknown } | undefined)?.restamp, token.sub) : null;
          if (restamped !== null && revokedBefore(anchor) === restamped) {
            token.authTime = Date.now();
          } else {
            // Tokens minted before authTime existed fall back to iat (seconds).
            const authTime = typeof token.authTime === "number" ? token.authTime : typeof token.iat === "number" ? token.iat * 1000 : 0;
            if (!sessionStillValid(anchor, authTime)) return null;
          }
        }
      }
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
        token.theme = dbUser?.themePreference ?? "SYSTEM";
        // Profile photo for the header and app bar, which only have the session.
        token.picture = dbUser?.image ?? token.picture ?? null;

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
        // The google-2fa step is still a Google sign-in as far as the user
        // (and the "Google linked" UI) is concerned.
        token.provider = account.provider === "google-2fa" ? "google" : account.provider;
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
                  themePreference: true,
                  image: true,
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
          // So a theme chosen in settings survives the next page load
          // instead of ThemeSync re-applying the stale value from the token.
          token.theme = dbUser.themePreference;
          // An avatar upload/removal calls update(), so the header photo
          // follows without a re-login.
          token.picture = dbUser.image;
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
        // Left undefined for tokens issued before the column existed: ThemeSync
        // skips undefined, so those users keep their device choice until they
        // next sign in, rather than being reset to SYSTEM.
        session.user.theme = token.theme as ThemePreference | undefined;
        session.user.image = (token.picture as string | null | undefined) ?? null;
        // Absent role (pre-RBAC session tokens) fails closed to USER.
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
        session.user.isTwoFactorEnabled = token.isTwoFactorEnabled === true;
      }
      return session;
    },
  },
});
