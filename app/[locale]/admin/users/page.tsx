import type { Metadata } from "next";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { ADMIN_USER_FILTERS, listAdminUsers, type AdminUserFilter } from "@/lib/adminUsers";
import AdminUsersTable from "@/components/admin/AdminUsersTable";
import { can } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Users — My Energy Admin",
  description: "Customer accounts and F-Gas certificate review.",
  robots: { index: false, follow: false },
};

// Certificate decisions change who may buy; never serve this from cache.
export const dynamic = "force-dynamic";

interface AdminUsersPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}

export default async function AdminUsersPage({ params, searchParams }: AdminUsersPageProps) {
  // Before any data is read — this page lists every account's PII.
  const admin = await guardAdmin(params, "users.view");

  const sp = await searchParams;
  const filter = (ADMIN_USER_FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as AdminUserFilter) : "all";
  const query = (sp.q ?? "").slice(0, 120);
  const data = await listAdminUsers({ filter, query, page: Number(sp.page) || 1 });

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-8 md:py-14">
      <header className="mb-7">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[.09em] text-slate-400 dark:text-slate-500">Compliance</p>
        <h1 className="m-0 mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-.045em] md:text-[38px]">Users</h1>
        <p className="m-0 mt-2.5 max-w-[640px] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">
          Every account and where its F-Gas certificate stands. Uploads are checked automatically; this is where you
          overturn a refusal after looking at the document, or revoke an approval that shouldn&rsquo;t stand.
        </p>
      </header>

      <AdminUsersTable data={data} filter={filter} query={query} canManageRoles={can(admin.role, "users.roles")} />
    </div>
  );
}
