import type { Metadata } from "next";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { ADMIN_ORDER_FILTERS, listAdminOrders, type AdminOrderFilter } from "@/lib/adminOrders";
import AdminOrdersTable from "@/components/admin/AdminOrdersTable";
import { pickupDefaults } from "@/lib/shipping/resolve";
import { countryName } from "@/lib/country";

export const metadata: Metadata = {
  title: "Orders — My Energy Admin",
  description: "Customer orders: payment, dispatch and delivery.",
  robots: { index: false, follow: false },
};

// Payment and dispatch state change all day; never serve a cached list.
export const dynamic = "force-dynamic";

interface AdminOrdersPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}

export default async function AdminOrdersPage({ params, searchParams }: AdminOrdersPageProps) {
  // Before any data is read — this lists every customer's orders and addresses.
  await guardAdmin(params, "orders.view");

  const sp = await searchParams;
  const filter = (ADMIN_ORDER_FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as AdminOrderFilter) : "all";
  const query = (sp.q ?? "").slice(0, 120);
  const data = await listAdminOrders({ filter, query, page: Number(sp.page) || 1 });
  const { locale } = await params;
  const codes = new Set(data.rows.flatMap((o) => (o.customer.country ? [o.customer.country.code] : [])));
  const countryNames = Object.fromEntries([...codes].map((code) => [code, countryName(code, locale)]));

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-8 md:py-14">
      <header className="mb-7">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[.09em] text-slate-400 dark:text-slate-500">Fulfilment</p>
        <h1 className="m-0 mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-.045em] md:text-[38px]">Orders</h1>
        <p className="m-0 mt-2.5 max-w-[640px] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">
          Record bank-transfer payments, choose how each order travels — DHL, another ADR carrier, our own ADR vehicle or
          collection at the warehouse — and move it through its delivery stages; the customer is emailed at each real
          step. Unpaid orders that haven&rsquo;t shipped can be cancelled — stock, invoice and cylinder ledger are all put right.
        </p>
      </header>

      <AdminOrdersTable data={data} filter={filter} query={query} pickupAddress={pickupDefaults().location} countryNames={countryNames} />
    </div>
  );
}
