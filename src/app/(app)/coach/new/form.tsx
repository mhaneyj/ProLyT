"use client";
import { useActionState } from "react";
import { createSession, type NewSessionState } from "./actions";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const label = "mb-1.5 block text-sm text-soft";
const LENGTHS = [[30, "30 min"], [45, "45 min"], [60, "1 hr"], [75, "1 hr 15"], [90, "1 hr 30"], [120, "2 hrs"], [180, "3 hrs"], [240, "4 hrs"]] as const;

export function NewSessionForm({ programs, coaches, me, isOwner, today }: {
  programs: { v: string; label: string }[]; coaches: { id: string; name: string }[]; me: string; isOwner: boolean; today: string;
}) {
  const [state, action, pending] = useActionState<NewSessionState, FormData>(createSession, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="program" className={label}>Program</label>
        <select id="program" name="program" defaultValue={v.program ?? "7v7"} className={input}>
          {programs.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="title" className={label}>Session name</label>
        <input id="title" name="title" defaultValue={v.title} placeholder="7v7 · Skill positions" className={input} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="date" className={label}>Date</label><input id="date" name="date" type="date" min={today} defaultValue={v.date ?? today} className={input} /></div>
        <div><label htmlFor="time" className={label}>Start time</label><input id="time" name="time" type="time" step={900} defaultValue={v.time ?? "17:30"} className={input} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="minutes" className={label}>Length</label>
          <select id="minutes" name="minutes" defaultValue={v.minutes ?? "90"} className={input}>
            {LENGTHS.map(([m, t]) => <option key={m} value={m}>{t}</option>)}
          </select>
        </div>
        <div><label htmlFor="capacity" className={label}>Spots (optional)</label><input id="capacity" name="capacity" inputMode="numeric" defaultValue={v.capacity} placeholder="No limit" className={input} /></div>
      </div>
      <div><label htmlFor="location" className={label}>Location</label><input id="location" name="location" defaultValue={v.location} placeholder="Del Oro HS, field 2" className={input} /></div>
      {isOwner ? (
        <div>
          <label htmlFor="coach" className={label}>Coach</label>
          <select id="coach" name="coach" defaultValue={v.coach ?? me} className={input}>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="weeks" className={label}>Repeat weekly</label>
          <select id="weeks" name="weeks" defaultValue={v.weeks ?? "1"} className={input}>
            <option value="1">Just once</option>
            {[4, 6, 8, 10, 12].map((w) => <option key={w} value={w}>{w} weeks</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="price" className={label}>Price (1-on-1, camp)</label>
          <input id="price" name="price" inputMode="decimal" defaultValue={v.price} placeholder="Free / in package" className={input} />
        </div>
      </div>
      <p className="text-xs text-muted">Sessions without a price can be booked by families from their schedule. Paid sessions are booked by you from the session page.</p>
      {state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm text-cream">{state.error}</div> : null}
      <button disabled={pending} className="min-h-14 w-full rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {pending ? "Posting…" : "Post session"}
      </button>
    </form>
  );
}
