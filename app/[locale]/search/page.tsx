import type { Metadata } from "next";
import MobileSearchLayout from "@/components/MobileSearchLayout";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Search — My Energy",
  description: "Search cylinders, orders, and Safety Data Sheets.",
};

export default function SearchPage() {
  return (
    <AppChrome>
      <div className="mx-auto w-full md:max-w-[620px] md:py-10">
      <MobileSearchLayout />
      </div>
    </AppChrome>
  );
}
