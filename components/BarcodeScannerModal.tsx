"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ELEMENT_ID = "halocore-barcode-scanner";

type ScannerStatus = "starting" | "scanning" | "denied";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export default function BarcodeScannerModal({ open, onClose, onScanSuccess }: BarcodeScannerModalProps) {
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10 },
        (decodedText) => onScanSuccess(decodedText),
        undefined
      )
      .then(() => {
        if (cancelled) return;
        // html5-qrcode sets its own inline width/height/object-fit on the
        // <video> it creates, sized to the camera's native resolution — that
        // letterboxes a landscape/square feed inside this portrait modal.
        // Override those inline styles (after the library's own write) so
        // the feed fills the screen like a native camera view.
        const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_ELEMENT_ID} video`);
        if (video) {
          video.style.width = "100%";
          video.style.height = "100%";
          video.style.objectFit = "cover";
        }
        setStatus("scanning");
      })
      .catch(() => {
        // Camera permission denied, no camera available, or insecure context.
        if (!cancelled) setStatus("denied");
      });

    return () => {
      cancelled = true;
      scannerRef.current = null;
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      } else {
        scanner.clear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onScanSuccess is stable from the parent
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-950 [animation:hc-panel_.28s_cubic-bezier(.2,.8,.2,1)_both]">
      {/*
        html5-qrcode overwrites the target element's inline `position` style
        (to "relative"), which would break `inset-0` sizing if applied
        directly to it. Keep positioning on this untouched wrapper and let
        the library's div just fill it via a plain height/width class.
      */}
      <div className="absolute inset-0">
        <div id={SCANNER_ELEMENT_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-black/35" />

      {status !== "denied" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[240px] w-[240px]">
            <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white/90" />
            <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white/90" />
            <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white/90" />
            <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-2xl border-b-[3px] border-r-[3px] border-white/90" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <span className="text-[15px] font-semibold tracking-[-.02em] text-white">Scan Barcode</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center">
        {status === "denied" ? (
          <div className="mx-auto flex max-w-[280px] flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
              <CameraOff size={22} strokeWidth={1.8} />
            </span>
            <p className="text-[13px] leading-[1.5] text-white/80">
              Camera access is off. Enable camera permissions in your browser settings to scan a cylinder label.
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-white/70">
            {status === "starting" ? "Starting camera…" : "Align the barcode within the frame"}
          </p>
        )}

        <button
          type="button"
          onClick={() => onScanSuccess("MYENERGY-DEMO")}
          className="mt-5 text-[12.5px] font-semibold text-white/60 underline underline-offset-2 transition-colors hover:text-white/85"
        >
          Don&apos;t have a barcode? Simulate scan
        </button>
      </div>
    </div>
  );
}
