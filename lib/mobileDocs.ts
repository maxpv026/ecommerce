export interface CertRow {
  label: string;
  value: string;
  strong?: boolean;
}

export interface CertInfo {
  title: string;
  rows: CertRow[];
}

// Mobile-only certification & SDS data — independent of the desktop
// SdsPage/CertificationsPage data, same per-page divergence precedent as
// the rest of the mobile app shell.
export const EPA_CERT: CertInfo = {
  title: "F-Gas Certified · Category I",
  rows: [
    { label: "HOLDER", value: "Пивоваров Максим Романович", strong: true },
    { label: "ID", value: "FGAS-849201" },
    { label: "ISSUED", value: "Oct 12, 2025" },
    { label: "EXPIRES", value: "Oct 12, 2029" },
  ],
};

export interface SdsDoc {
  id: number;
  name: string;
  meta: string;
}

export const SDS_DOCS: SdsDoc[] = [
  { id: 1, name: "R-410A Safety Data Sheet", meta: "PDF • 1.2 MB · rev 2.4" },
  { id: 2, name: "R-32 Safety Data Sheet", meta: "PDF • 1.4 MB · rev 2.1" },
  { id: 3, name: "R-134a Safety Data Sheet", meta: "PDF • 1.1 MB · rev 3.0" },
  { id: 4, name: "R-404A Safety Data Sheet", meta: "PDF • 1.3 MB · rev 1.8" },
  { id: 5, name: "R-454B Safety Data Sheet", meta: "PDF • 1.5 MB · rev 1.3" },
];
