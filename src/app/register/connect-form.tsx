"use client";
import Link from "next/link";
import { useActionState } from "react";
import { connectAthlete, type RegisterState } from "./actions";

type Plan = { id: string; name: string; price_cents: number };
const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";

export function ConnectForm({ athletes, plans }: { athletes: { id: string; first_name: string; last_name: string; programs: string | null }[]; plans: Plan[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(connectAthlete, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label htmlFor="c-athlete" className="mb-1.5 block text-sm text-soft">Athlete</label>
        <select id="c-athlete" name="athlete" defaultValue={v.athlete} className={input}>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>{a.first_name} {a.last_name}{a.programs ? ` (trains with ${a.programs})` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="c-plan" className="mb-1.5 block text-sm text-soft">Package</label>
        <select id="c-plan" name="plan" defaultValue={v.plan ?? ""} className={input}>
          <option value="">Free for now (choose later)</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · ${p.price_cents / 100}/mo</option>)}
        </select>
      </div>
      <label className="flex gap-3 text-sm text-soft">
        <input type="checkbox" name="agree" defaultChecked={v.agree === "on"} className="mt-0.5 size-5 flex-none accent-[var(--color-gold)]" />
        <span>I agree to this program&apos;s <Link href="/legal/participation" target="_blank" className="underline">participation terms</Link> and <Link href="/legal/waiver" target="_blank" className="underline">waiver</Link>, and to share my athlete&apos;s profile and results with them.</span>
      </label>
      <label className="flex gap-3 text-sm text-soft">
        <input type="checkbox" name="media" defaultChecked={v.media === "on"} className="mt-0.5 size-5 flex-none accent-[var(--color-gold)]" />
        <span>Optional: coaches may photograph and film my athlete for training.</span>
      </label>
      <div>
        <label htmlFor="c-signer" className="mb-1.5 block text-sm text-soft">Type your full name to sign</label>
        <input id="c-signer" name="signer" autoComplete="name" defaultValue={v.signer} className={input} />
      </div>
      {state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm">{state.error}</div> : null}
      <button disabled={pending} className="min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {pending ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
