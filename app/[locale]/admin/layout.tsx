import AdminNav from "@/components/admin/AdminNav";
import { currentRole } from "@/lib/admin/permissions";
import FullMessagesProvider from "@/components/i18n/FullMessagesProvider";

/**
 * Shell for every /admin page: the admin navigation beside the page.
 *
 * Presentation only. It deliberately does not guard — a layout is not
 * re-run on client-side navigation between its pages, so it can't be the
 * gate. proxy.ts is the outer wall and each page's guardAdmin() (plus
 * requirePermission() in every action) is the real one.
 */
export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // The role decides which sections the navigation lists (presentation —
  // proxy.ts and each page's guardAdmin enforce). Re-read from the row.
  const role = (await currentRole()) ?? "USER";
  // Admin screens read namespaces the storefront never ships (lib/i18n/clientMessages).
  return (
    <FullMessagesProvider locale={locale}>
      <div className="flex flex-1 flex-col bg-slate-50 md:flex-row dark:bg-canvas" data-admin-shell>
        <AdminNav role={role} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </FullMessagesProvider>
  );
}
