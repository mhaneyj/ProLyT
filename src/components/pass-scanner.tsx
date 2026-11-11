"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const codeFrom = (text: string) => text.match(/\/checkin\/([0-9a-f]{32})/)?.[1] ?? (/^[0-9a-f]{32}$/.test(text) ? text : null);

/** Point the camera at a pass; opens that athlete's check-in screen the moment it reads one. */
export function PassScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "blocked" | "found">("starting");
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch { setState("blocked"); return; }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setState("scanning");
      const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
      const native = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = native ? null : (await import("jsqr")).default;
      const tick = async () => {
        if (stopped || !video.current) return;
        const v = video.current;
        let text: string | null = null;
        if (v.readyState >= 2) {
          if (native) {
            text = (await native.detect(v).catch(() => []))[0]?.rawValue ?? null;
          } else if (jsQR && ctx) {
            const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w; canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
        }
        const code = text ? codeFrom(text) : null;
        if (code) { setState("found"); navigator.vibrate?.(60); router.push(`/checkin/${code}`); return; }
        raf = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    })();
    return () => { stopped = true; clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [router]);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl border-2 border-gold bg-black">
        <video ref={video} muted playsInline className="size-full object-cover" aria-label="Camera" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-xl border-4 border-white/80" />
      </div>
      <p role="status" className="text-center text-sm text-soft">
        {state === "starting" ? "Starting the camera…" : state === "scanning" ? "Point at the QR code on the family's phone." : state === "found" ? "Got it…"
          : "Camera is blocked. Allow camera access for this site, or use your phone's Camera app on the pass (it opens the same screen)."}
      </p>
    </div>
  );
}
