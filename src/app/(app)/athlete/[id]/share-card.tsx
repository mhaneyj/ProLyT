"use client";
import { useState } from "react";

export function CopyLink({ url, label = "Profile link", title = "Recruiting profile" }: { url: string; label?: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ url, title });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* closed the share sheet */ }
  }
  return (
    <div className="flex flex-col gap-2">
      <input readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()}
        className="min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-sm text-soft" />
      <button type="button" onClick={share} className="min-h-12 w-full rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold">
        {copied ? "Copied ✓" : "Share link"}
      </button>
    </div>
  );
}
