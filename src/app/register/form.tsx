"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAthlete, type RegisterState } from "./actions";

type Plan = { id: string; name: string; price_cents: number; sessions_per_week: number | null };

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const label = "mb-1.5 block text-sm text-soft";

function Field({ id, text, children, hint }: { id: string; text: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function under13(birth: string) {
  if (!birth) return false;
  const b = new Date(birth), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a < 13;
}

export function RegisterForm({ plans, stripe }: { plans: Plan[]; stripe: boolean }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAthlete, {});
  const [birth, setBirth] = useState(state.values?.birth ?? "");
  const [plan, setPlan] = useState(state.values?.plan ?? ""); // "" = free for now
  const young = under13(birth);
  const v = state.values ?? {};

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">1 · Athlete</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="first" text="First name"><input id="first" name="first" defaultValue={v.first} autoComplete="off" className={input} required /></Field>
          <Field id="last" text="Last name"><input id="last" name="last" defaultValue={v.last} autoComplete="off" className={input} required /></Field>
        </div>
        <Field id="birth" text="Birth date">
          <input id="birth" name="birth" type="date" className={input} required value={birth} onChange={(e) => setBirth(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="position" text="Position"><input id="position" name="position" defaultValue={v.position} placeholder="OL, WR, QB…" className={input} /></Field>
          <Field id="grad_year" text="Class of"><input id="grad_year" name="grad_year" defaultValue={v.grad_year} inputMode="numeric" placeholder="2030" className={input} /></Field>
        </div>
        <Field id="school" text="School" hint="Only coaches see this. It's never shown publicly."><input id="school" name="school" defaultValue={v.school} className={input} /></Field>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">2 · Package</legend>
        <label className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-4 ${plan === "" ? "border-2 border-gold bg-gold/5" : "border-line bg-panel"}`}>
          <input type="radio" name="plan" value="" checked={plan === ""} onChange={() => setPlan("")} className="size-5 accent-[var(--color-gold)]" />
          <span className="flex-1">
            <span className="block font-semibold">Free for now</span>
            <span className="block text-xs text-muted">Try the app. Choose a package anytime from your home screen.</span>
          </span>
          <span className="tabular font-display text-2xl">$0</span>
        </label>
        {plans.map((p) => (
          <label key={p.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-4 ${plan === p.id ? "border-2 border-gold bg-gold/5" : "border-line bg-panel"}`}>
            <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} className="size-5 accent-[var(--color-gold)]" />
            <span className="flex-1">
              <span className="block font-semibold">{p.name}</span>
              {p.sessions_per_week ? <span className="block text-xs text-muted">{p.sessions_per_week} session{p.sessions_per_week > 1 ? "s" : ""} a week</span> : null}
            </span>
            <span className="tabular font-display text-2xl">${p.price_cents / 100}<span className="font-sans text-xs text-muted">/mo</span></span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">3 · Safety</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="emergency_name" text="Emergency contact"><input id="emergency_name" name="emergency_name" defaultValue={v.emergency_name} className={input} required /></Field>
          <Field id="emergency_phone" text="Their phone"><input id="emergency_phone" name="emergency_phone" defaultValue={v.emergency_phone} type="tel" autoComplete="tel" className={input} required /></Field>
        </div>
        <Field id="allergies" text="Allergies (optional)"><input id="allergies" name="allergies" defaultValue={v.allergies} className={input} /></Field>
        <Field id="conditions" text="Medical notes for coaches (optional)" hint="Seen only by you and the program's coaches.">
          <textarea id="conditions" name="conditions" defaultValue={v.conditions} rows={2} className={`${input} py-2`} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">4 · Agreements</legend>
        <label className="flex gap-3 text-sm text-soft">
          <input type="checkbox" name="agree" defaultChecked={v.agree === "on"} className="mt-0.5 size-5 flex-none accent-[var(--color-gold)]" />
          <span>I agree to the <Link href="/legal/participation" target="_blank" className="underline">participation terms</Link>, <Link href="/legal/waiver" target="_blank" className="underline">liability waiver</Link> and <Link href="/legal/privacy" target="_blank" className="underline">family privacy notice</Link>.</span>
        </label>
        <label className="flex gap-3 text-sm text-soft">
          <input type="checkbox" name="media" defaultChecked={v.media === "on"} className="mt-0.5 size-5 flex-none accent-[var(--color-gold)]" />
          <span>Optional: coaches may photograph and film my athlete for training and program use. Nothing is posted publicly without my approval each time.</span>
        </label>
        {young ? (
          <label className="flex gap-3 rounded-lg border border-gold p-3 text-sm text-soft">
            <input type="checkbox" name="verify" defaultChecked={v.verify === "on"} className="mt-0.5 size-5 flex-none accent-[var(--color-gold)]" />
            <span>My athlete is under 13. I confirm I am their parent or legal guardian and consent to the program collecting the information above. My card payment is used to verify this.</span>
          </label>
        ) : null}
        <Field id="signer" text="Type your full name to sign"><input id="signer" name="signer" defaultValue={v.signer} autoComplete="name" className={input} required /></Field>
      </fieldset>

      {state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm text-cream">{state.error}</div> : null}
      <button disabled={pending} className="min-h-14 w-full rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {pending ? "Saving…" : stripe && plan ? "Continue to payment" : "Register"}
      </button>
    </form>
  );
}
