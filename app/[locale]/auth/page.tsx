import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import MobileAuthLayout from "@/components/MobileAuthLayout";
import DesktopAuthCard from "@/components/DesktopAuthCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return {
    title: `${t("welcomeTitle")} — My Energy`,
    description: t("welcomeSubtitle"),
  };
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <div className="block md:hidden">
        <MobileAuthLayout />
      </div>
      <div className="hidden md:block">
        <DesktopAuthCard />
      </div>
    </Suspense>
  );
}
