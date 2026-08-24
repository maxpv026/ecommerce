import type { Metadata } from "next";
import MobileSearchLayout from "@/components/MobileSearchLayout";

export const metadata: Metadata = {
  title: "Search — My Energy",
  description: "Search cylinders, orders, and Safety Data Sheets.",
};

export default function SearchPage() {
  return (
    <div className="block md:hidden">
      <MobileSearchLayout />
    </div>
  );
}
