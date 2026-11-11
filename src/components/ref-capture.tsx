"use client";
import { useEffect } from "react";

// First-touch attribution: when someone opens a ProLyt link carrying ?r=CODE, remember the code and
// the page they landed on (30 days) so their signup can be credited, and count the link open.
// Nothing personal is stored: just the sender's referral code and a random visitor id.
export function RefCapture() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("r");
      const has = (n: string) => document.cookie.split("; ").some((c) => c.startsWith(`${n}=`));
      const secure = location.protocol === "https:" ? "; Secure" : "";
      if (!has("prolyt_anon")) {
        const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
        document.cookie = `prolyt_anon=${id}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
      }
      if (!code || !/^[a-z0-9]{8}$/.test(code)) return;
      // Sent to sign-in first? The page they were headed to is the real landing page.
      const next = url.pathname === "/login" ? url.searchParams.get("next") : null;
      const landing = next && next.startsWith("/") && !next.startsWith("//") ? next : url.pathname;
      if (!has("prolyt_ref")) {
        document.cookie = `prolyt_ref=${encodeURIComponent(`${code}|${landing}`)}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${secure}`;
      }
      const key = `prolyt_opened_${code}_${landing}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      navigator.sendBeacon?.("/api/track", JSON.stringify({ event: "link_opened", path: landing, ref: code }));
    } catch {
      // Storage blocked (private mode): attribution is best-effort.
    }
  }, []);
  return null;
}
