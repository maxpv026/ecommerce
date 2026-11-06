import AdminNav from "@/components/admin/AdminNav";

/**
 * Shell for every /admin page: the admin navigation beside the page.
 *
 * Presentation only. It deliberately does not guard — a layout is not
 * re-run on client-side navigation between its pages, so it can't be the
 * gate. proxy.ts is the outer wall and each page's guardAdmin() (plus
 * requireAdmin() in every action) is the real one.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-slate-50 md:flex-row dark:bg-canvas" data-admin-shell>
      <AdminNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
