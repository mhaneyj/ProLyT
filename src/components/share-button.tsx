"use client";
import { useState } from "react";
import { Icon } from "./icons";

/**
 * Opens the phone's share sheet with the post's photos/video (or a Story-sized graphic),
 * so it goes straight to Instagram, TikTok, Facebook, Messages… Desktop: download instead.
 */
export function ShareButton({ postId, media, text }: { postId: string; media: { id: string; kind: "photo" | "video" }[]; text: string }) {
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  async function files() {
    const list = media.length ? media.map((m) => ({ url: `/api/media/${m.id}`, name: m.kind === "video" ? "prolyt-clip.mp4" : `prolyt-${m.id.slice(0, 6)}.jpg` }))
      : [{ url: `/api/post/${postId}/card`, name: "prolyt-story.png" }];
    return Promise.all(list.map(async (f) => {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error("Couldn't load the media");
      const b = await r.blob();
      return new File([b], f.name, { type: b.type || (f.name.endsWith(".mp4") ? "video/mp4" : "image/png") });
    }));
  }
  async function share() {
    setState("busy");
    try {
      const fs = await files();
      if (navigator.canShare?.({ files: fs })) {
        await navigator.share({ files: fs, text });
        setState("idle");
        return;
      }
      for (const f of fs) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f); a.download = f.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      setState("saved");
    } catch (e) {
      setState(e instanceof Error && e.name === "AbortError" ? "idle" : "error");
    }
  }
  return (
    <button type="button" onClick={share} disabled={state === "busy"}
      className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-soft hover:text-cream disabled:opacity-60">
      <Icon name="send" size={17} />
      {state === "busy" ? "Getting it ready…" : state === "saved" ? "Saved · caption copied" : state === "error" ? "Try again" : "Share"}
    </button>
  );
}
