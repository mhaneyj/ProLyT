"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch the server page every few seconds while it's visible (live scores, a pass waiting for check-in). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    const v = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [router, seconds]);
  return null;
}
