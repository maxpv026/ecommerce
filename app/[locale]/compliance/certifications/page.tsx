import type { Metadata } from "next";
import CertificationsPage from "@/components/CertificationsPage";

export const metadata: Metadata = {
  title: "Quality & Certifications — My Energy",
  description:
    "AHRI-700 purity, DOT-39 transport safety, and ISO 9001 quality management behind every My Energy cylinder.",
};

export default function Page() {
  return <CertificationsPage />;
}
