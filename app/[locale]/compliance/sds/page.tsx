import type { Metadata } from "next";
import SdsPage from "@/components/SdsPage";

export const metadata: Metadata = {
  title: "Safety Data Sheets (SDS) — My Energy",
  description:
    "Download official AHRI-700 and F-Gas compliant Safety Data Sheets for all My Energy refrigerants.",
};

export default function Page() {
  return <SdsPage />;
}
