import type { Metadata } from "next";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { countRegulatoryAudience, recentBroadcasts } from "@/lib/broadcast";
import AdminBroadcastComposer from "@/components/admin/AdminBroadcastComposer";

export const metadata: Metadata = {
  title: "Broadcast — My Energy Admin",
  description: "Send a regulatory update to every customer opted in to receive one.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
// Server actions invoked from this page inherit it: each sending pass
// stops at 40 s (lib/actions/broadcast) and this leaves headroom above that.
export const maxDuration = 60;

export default async function AdminBroadcastPage({ params }: { params: Promise<{ locale: string }> }) {
  // Before any data is read. guardAdmin never returns on failure.
  await guardAdmin(params);

  const [audience, recent] = await Promise.all([countRegulatoryAudience(), recentBroadcasts()]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-8 md:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[.09em] text-slate-400 dark:text-slate-500">
            Communications
          </p>
          <h1 className="m-0 mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-.045em] md:text-[38px]">
            Regulatory broadcast
          </h1>
          <p className="m-0 mt-2.5 max-w-[560px] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">
            Email an F-Gas or compliance update to every customer who opted in. Each email carries a one-click unsubscribe,
            and anyone who opts out mid-send is skipped.
          </p>
        </div>
      </header>

      <AdminBroadcastComposer initialAudience={audience} initialRecent={recent} />
    </div>
  );
}
