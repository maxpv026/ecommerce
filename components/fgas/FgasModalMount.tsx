"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFgasModal } from "@/lib/fgasModalEvents";

const FgasVerificationModal = dynamic(() => import("../FgasVerificationModal"), { ssr: false });

/**
 * Mounted once in the locale layout. The window's code loads on first open.
 * `?fgas=upload` (the link in the expiry / refusal emails) opens it directly.
 */
export default function FgasModalMount() {
  const open = useFgasModal((s) => s.open);
  const show = useFgasModal((s) => s.show);
  const params = useSearchParams();
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) setEverOpened(true);

  const wantsUpload = params.get("fgas") === "upload";
  useEffect(() => {
    if (wantsUpload) show("profile");
  }, [wantsUpload, show]);

  return everOpened ? <FgasVerificationModal /> : null;
}
