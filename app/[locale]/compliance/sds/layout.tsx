import FullMessagesProvider from "@/components/i18n/FullMessagesProvider";

/** This route's client components read namespaces the root layout leaves out (lib/i18n/clientMessages). */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <FullMessagesProvider locale={locale}>{children}</FullMessagesProvider>;
}
