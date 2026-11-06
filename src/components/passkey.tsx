"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";

const post = async (url: string, body?: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Something went wrong");
  return j;
};
const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

/** What this device calls its passkey sign-in. */
function faceIdLabel() {
  if (typeof navigator === "undefined") return "Face ID";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Android/.test(ua)) return "fingerprint";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "passkey";
}

export function PasskeySignIn({ next }: { next: string }) {
  const [ok, setOk] = useState(false);
  const [label, setLabel] = useState("Face ID");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setOk(browserSupportsWebAuthn()); setLabel(faceIdLabel()); }, []);
  if (!ok) return null;
  async function go() {
    setBusy(true); setError(null);
    try {
      const options = await post("/api/passkey/login/options");
      const response = await startAuthentication({ optionsJSON: options });
      const { next: to } = await post("/api/passkey/login/verify", { response, next });
      window.location.assign(to);
    } catch (e) {
      if (!cancelled(e)) setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={go} disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-cream font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-ink disabled:opacity-60">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0" /></svg>
        {busy ? "Checking…" : `Sign in with ${label}`}
      </button>
      {error ? <p role="alert" className="text-center text-[13px] text-bad">{error}</p> : null}
    </div>
  );
}

/** After an email sign-in: offer Face ID so next time is one tap. */
export function PasskeyNudge() {
  const [show, setShow] = useState(false);
  const [label, setLabel] = useState("Face ID");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let off = false;
    try { off = localStorage.getItem("prolyt_pk_skip") === "1"; } catch {}
    if (off || !browserSupportsWebAuthn()) return;
    setLabel(faceIdLabel());
    platformAuthenticatorIsAvailable().then(setShow, () => undefined);
  }, []);
  if (!show) return null;
  const skip = () => { try { localStorage.setItem("prolyt_pk_skip", "1"); } catch {} setShow(false); };
  async function setUp() {
    setState("busy");
    try {
      const options = await post("/api/passkey/register/options");
      const response = await startRegistration({ optionsJSON: options });
      await post("/api/passkey/register/verify", { response, device: faceIdLabel() });
      setState("done");
      skip();
      setShow(true);
    } catch (e) {
      if (cancelled(e)) { setState("idle"); return; }
      setMsg(e instanceof Error ? e.message : "Couldn't set it up"); setState("error");
    }
  }
  if (state === "done") return <div role="status" className="rounded-xl border border-good p-3 text-sm text-good">Done. Next time, tap “Sign in with {label}”.</div>;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold/60 bg-gold/5 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Sign in with {label} next time</div>
        <div className="text-[12px] text-muted">{state === "error" ? msg : "No email, no code. One tap."}</div>
      </div>
      <button onClick={setUp} disabled={state === "busy"} className="min-h-11 flex-none rounded-md bg-gold px-3 text-sm font-bold text-on-gold disabled:opacity-60">{state === "busy" ? "…" : "Turn on"}</button>
      <button onClick={skip} aria-label="Not now" className="min-h-11 flex-none px-1 text-muted hover:text-cream">✕</button>
    </div>
  );
}

/** The 6-digit code box: fills from the phone's suggestion and signs in as soon as it has 6 digits. */
export function CodeInput({ className }: { className: string }) {
  const { pending } = useFormStatus();
  const sent = useRef(false);
  return (
    <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus
      placeholder="123456" className={className} readOnly={pending}
      onChange={(e) => {
        if (e.target.value.replace(/\D/g, "").length === 6 && !sent.current) { sent.current = true; e.target.form?.requestSubmit(); }
      }} />
  );
}

/** A submit button that locks (and says so) while its form is sending, so a second tap can't send it twice. */
export function SubmitButton({ children, busy, className, formAction }: { children: React.ReactNode; busy: string; className: string; formAction?: (f: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} disabled={pending} aria-disabled={pending}
      onClick={(e) => { if (pending) e.preventDefault(); }} className={`${className} disabled:opacity-60`}>
      {pending ? busy : children}
    </button>
  );
}
