"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useSmartOrderUi } from "@/lib/smartOrderEvents";

const SmartBulkOrderModal = dynamic(() => import("./SmartBulkOrderModal"), { ssr: false });

/**
 * Mounted once in the locale layout. Nothing of the modal is downloaded until
 * the first open; after that it stays mounted (closed), so reopening keeps
 * what was typed.
 */
export default function SmartOrderMount() {
  const open = useSmartOrderUi((s) => s.open);
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) setEverOpened(true);
  return everOpened ? <SmartBulkOrderModal /> : null;
}
