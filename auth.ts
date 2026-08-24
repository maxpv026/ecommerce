import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { verifyAndConsumeOtp } from "@/lib/otp";
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

        const validCode = await verifyAndConsumeOtp(email, code);
        if (!validCode) return null;

        if (!user.emailVerified) {
          await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        // Sign-in only: pull the My Energy-specific profile fields once here
        // rather than on every request, since the User row is the source of
        // truth and authorize()/the adapter don't carry these through.
        const dbUser = user.email ? await prisma.user.findUnique({ where: { email: user.email } }) : null;
        token.companyName = dbUser?.companyName ?? null;
        token.epaVerified = dbUser?.epaVerified ?? false;
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
            await prisma.user.update({ where: { id: dbUser.id }, data: patch });
            if (patch.name) token.name = patch.name;
          }
        }
      }
      if (account) {
        token.provider = account.provider;
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
        session.user.epaVerified = Boolean(token.epaVerified);
        session.user.locale = (token.locale as string | undefined) ?? "en";
        // Absent role (pre-RBAC session tokens) fails closed to USER.
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
      }
      return session;
    },
  },
});
