"use client";
import { useActionState, useState } from "react";
import { saveBranding, saveCoachPay, inviteCoach, type FormState } from "./actions";
import { checkBrandColor, themeVars } from "@/lib/domain/brand";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const btn = "min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60";

function Status({ s }: { s: FormState }) {
  return (
    <div aria-live="polite" className="text-sm">
      {s.error ? <span role="alert" className="text-bad">{s.error}</span> : s.ok ? <span className="text-good">✓ {s.ok}</span> : null}
    </div>
  );
}

export function BrandingForm({ name, color, hasLogo }: { name: string; color: string; hasLogo: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBranding, {});
  const [c, setC] = useState(color);
  const valid = /^#[0-9A-Fa-f]{6}$/.test(c);
  const problem = valid ? checkBrandColor(c) : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm text-soft">Program name</label>
        <input id="name" name="name" defaultValue={name} className={input} />
      </div>
      <div>
        <label htmlFor="logo" className="mb-1.5 block text-sm text-soft">Logo</label>
        <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm text-soft file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-raised file:px-4 file:text-cream" />
        <p className="mt-1 text-xs text-muted">PNG with a transparent background works best. Under 500 KB.</p>
        {hasLogo ? (
          <label className="mt-2 flex items-center gap-2 text-sm text-soft">
            <input type="checkbox" name="remove_logo" className="size-5 accent-[var(--color-gold)]" /> Remove current logo
          </label>
        ) : null}
      </div>
      <div>
        <label htmlFor="brand_color_hex" className="mb-1.5 block text-sm text-soft">Brand color</label>
        <div className="flex gap-2">
          <input aria-label="Pick brand color" type="color" value={valid ? c : "#F8C40A"} onChange={(e) => setC(e.target.value.toUpperCase())} className="h-12 w-14 flex-none cursor-pointer rounded-md border border-[#333] bg-[#111] p-1" />
          <input id="brand_color_hex" name="brand_color" value={c} onChange={(e) => setC(e.target.value.trim())} className={`${input} tabular uppercase`} />
        </div>
        {problem ? <p className="mt-1 text-xs text-warn">{problem}</p> : null}
      </div>
      <div style={valid && !problem ? (themeVars(c) as React.CSSProperties) : undefined} className="rounded-lg border border-line p-3">
        <div className="mb-2 text-xs text-muted">Preview</div>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-gold px-4 py-2 font-cond text-sm font-extrabold uppercase tracking-[2px] text-on-gold">Button</span>
          <span className="font-display text-xl text-gold">+0.21 s</span>
          <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-on-gold">Coach-logged</span>
        </div>
      </div>
      <Status s={state} />
      <button disabled={pending || !!problem} className={btn}>{pending ? "Saving…" : "Save branding"}</button>
    </form>
  );
}

export function CoachPayForm({ shareBps, groupCents }: { shareBps: number; groupCents: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCoachPay, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="share" className="mb-1.5 block text-sm text-soft">1-on-1 coach share (%)</label>
          <input id="share" name="share" inputMode="numeric" defaultValue={shareBps / 100} className={`${input} tabular`} />
        </div>
        <div>
          <label htmlFor="group" className="mb-1.5 block text-sm text-soft">Group session rate ($)</label>
          <input id="group" name="group" inputMode="decimal" defaultValue={groupCents / 100} className={`${input} tabular`} />
        </div>
      </div>
      <Status s={state} />
      <button disabled={pending} className={btn}>{pending ? "Saving…" : "Save coach pay"}</button>
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteCoach, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-soft">Coach&apos;s email</label>
        <input id="email" name="email" type="email" autoComplete="off" className={input} />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm text-soft">Paid as</legend>
        <div className="grid grid-cols-2 gap-2">
          {[["contractor", "Contractor", "Weekly Stripe payouts"], ["employee", "Employee", "Through your payroll"]].map(([v, l, d]) => (
            <label key={v} className="flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 has-[:checked]:border-gold">
              <input type="radio" name="pay_type" value={v} defaultChecked={v === "contractor"} className="size-5 accent-[var(--color-gold)]" />
              <span><span className="block text-sm font-semibold">{l}</span><span className="block text-[11px] text-muted">{d}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <Status s={state} />
      <button disabled={pending} className={btn}>{pending ? "Saving…" : "Invite coach"}</button>
    </form>
  );
}
