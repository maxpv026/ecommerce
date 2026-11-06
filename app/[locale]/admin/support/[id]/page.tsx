import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { Link } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import type { ChatMessageData } from "@/lib/chatSession";
import AdminSupportThread from "@/components/admin/AdminSupportThread";
import { chatExpiresAt, isChatExpired, purgeIfExpired } from "@/lib/chatRetention";

export const metadata: Metadata = { title: "Support chat — My Energy Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminSupportThreadPage({ params }: PageProps<"/[locale]/admin/support/[id]">) {
  await guardAdmin(params);
  const { id } = await params;

  const session = await prisma.chatSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      escalationReason: true,
      escalatedAt: true,
      startedOn: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true, email: true, companyName: true, fGasStatus: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 500, select: { id: true, role: true, content: true, data: true, createdAt: true } },
    },
  });
  if (!session) notFound();
  // Retention: an hour quiet and it no longer exists — not even for the team.
  if (isChatExpired(session.updatedAt)) {
    await purgeIfExpired(session.id);
    notFound();
  }

  // What the assistant showed, named — the admin reads the transcript, not cards.
  const productIds = [...new Set(session.messages.flatMap((m) => ((m.data as ChatMessageData | null)?.productIds ?? [])))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true, weight: true } })
    : [];
  const productLabel = new Map(products.map((p) => [p.id, `${p.name} · ${p.weight} (${p.sku})`]));

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-10 md:px-8 md:py-14">
      <Link href="/admin/support" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Support chats
      </Link>
      <AdminSupportThread
        session={{
          id: session.id,
          status: session.status,
          escalationReason: session.escalationReason,
          startedOn: session.startedOn,
          createdAt: session.createdAt.toISOString(),
          expiresAt: chatExpiresAt(session.updatedAt).toISOString(),
          customer: session.user
            ? { name: session.user.name, email: session.user.email, company: session.user.companyName, fGas: session.user.fGasStatus }
            : null,
        }}
        messages={session.messages.map((m) => {
          const data = (m.data as ChatMessageData | null) ?? {};
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            products: (data.productIds ?? []).map((pid) => productLabel.get(pid) ?? "a product no longer in the catalog"),
            escalated: Boolean(data.escalated),
          };
        })}
      />
    </div>
  );
}
