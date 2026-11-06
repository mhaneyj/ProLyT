"use client";
import { useActionState, useState } from "react";
import { startAthlete, type StartState } from "./actions";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const label = "mb-1.5 block text-sm text-soft";
const SPORTS = ["Football", "Basketball", "Baseball", "Softball", "Soccer", "Volleyball", "Track and field", "Lacrosse", "Wrestling", "Flag football", "Other"];

function ageOf(birth: string) {
  if (!birth) return null;
  const b = new Date(birth), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export function StartForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(startAthlete, {});
  const v = state.values ?? {};
  const [birth, setBirth] = useState(v.birth ?? "");
  const a = ageOf(birth);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="first" className={label}>First name</label><input id="first" name="first" defaultValue={v.first} autoComplete="given-name" className={input} /></div>
        <div><label htmlFor="last" className={label}>Last name</label><input id="last" name="last" defaultValue={v.last} autoComplete="family-name" className={input} /></div>
      </div>
      <div>
        <label htmlFor="birth" className={label}>Birth date</label>
        <input id="birth" name="birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={input} />
        <p className="mt-1 text-xs text-muted">Never shown on your profile. We use it to keep younger athletes safe.</p>
      </div>
      {a !== null && a < 13 ? (
        <div role="alert" className="rounded-lg border border-warn p-3 text-sm">Athletes under 13 need a parent to sign them up. Ask them to register you through your program.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sport" className={label}>Sport</label>
              <select id="sport" name="sport" defaultValue={v.sport ?? "Football"} className={input}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div><label htmlFor="position" className={label}>Position</label><input id="position" name="position" defaultValue={v.position} placeholder="OL, WR, PG…" className={input} /></div>
          </div>
          <div><label htmlFor="grad_year" className={label}>Class of</label><input id="grad_year" name="grad_year" inputMode="numeric" defaultValue={v.grad_year} placeholder="2029" className={input} /></div>
          {a === null || a < 18 ? (
            <div>
              <label htmlFor="parent_email" className={label}>Parent&apos;s email</label>
              <input id="parent_email" name="parent_email" type="email" autoComplete="off" defaultValue={v.parent_email} className={input} />
              <p className="mt-1 text-xs text-muted">We&apos;ll ask them to approve your profile. Until then it stays private and no one can message you.</p>
            </div>
          ) : null}
          {state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm text-cream">{state.error}</div> : null}
          <button disabled={pending} className="min-h-14 w-full rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
            {pending ? "Creating…" : "Create my profile"}
          </button>
        </>
      )}
    </form>
  );
}
