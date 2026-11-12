-- 4-role RBAC, step 2 of 2: the owner becomes SUPER_ADMIN.
--
-- Until now ADMIN was granted only to the ADMIN_EMAIL account (lib/rbac
-- re-derived it on every sign-in and demoted anyone else), so the existing
-- ADMIN row IS the owner — checked before this ran: one ADMIN row, the
-- ADMIN_EMAIL account. The address itself is deliberately not written here;
-- auth.ts binds SUPER_ADMIN to ADMIN_EMAIL on every request regardless.
-- ADMIN now means the operational role, assigned by the owner.
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';
