"use client";
import { useEffect, useState } from "react";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
type State = "loading" | "hidden" | "install" | "off" | "on" | "blocked" | "busy";

function keyBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** "Turn on notifications" for this phone. On iPhone, notifications need the app on the home screen first. */
export function EnablePush({ why, compact = false }: { why: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!KEY) return setState("hidden");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "install" : "hidden");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("hidden"));
  }, []);

  async function turnOn() {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState(Notification.permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
      const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(r.ok ? "on" : "off");
    } catch { setState("off"); }
  }

  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off");
  }

  if (state === "loading" || state === "hidden" || (compact && state === "blocked")) return null;
  if (state === "on") return compact ? null : (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-3 text-sm">
      <span className="text-good">🔔 Notifications are on for this phone</span>
      <button type="button" onClick={turnOff} className="min-h-11 text-[13px] text-muted hover:text-cream">Turn off</button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gold/60 bg-gold/5 p-3">
      <div className="text-sm"><span className="font-semibold">🔔 Get notified</span> <span className="text-soft">{why}</span></div>
      {state === "install" ? (
        <p className="text-[13px] text-soft">On iPhone: tap <span className="font-semibold">Share</span>, then <span className="font-semibold">Add to Home Screen</span>. Open ProLyt from your home screen and turn notifications on there.</p>
      ) : state === "blocked" ? (
        <p className="text-[13px] text-soft">Notifications are blocked for this site. Turn them on in your phone&apos;s settings for this app or browser.</p>
      ) : (
        <button type="button" onClick={turnOn} disabled={state === "busy"} className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold disabled:opacity-60">
          {state === "busy" ? "Turning on…" : "Turn on notifications"}</button>
      )}
    </div>
  );
}
