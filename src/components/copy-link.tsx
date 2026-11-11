"use client";
import { useEffect, useState } from "react";

/** A link with Copy and (on phones) Share buttons. `path` is turned into a full URL on this address. */
export function CopyLink({ path, label, text }: { path: string; label: string; text?: string }) {
  const [url, setUrl] = useState(path);
  const [done, setDone] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setUrl(`${window.location.origin}${path}`); setCanShare(typeof navigator.share === "function"); }, [path]);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-soft">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-ink px-2.5 text-[13px] text-soft" />
        <button type="button" onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => undefined); setDone(true); setTimeout(() => setDone(false), 2000); }}
          className="min-h-11 flex-none rounded-md border border-line px-3 text-sm font-bold hover:border-gold">{done ? "Copied" : "Copy"}</button>
        {canShare ? <button type="button" onClick={() => navigator.share({ url, text }).catch(() => undefined)} className="min-h-11 flex-none rounded-md bg-gold px-3 text-sm font-bold text-on-gold">Share</button> : null}
      </div>
    </div>
  );
}
