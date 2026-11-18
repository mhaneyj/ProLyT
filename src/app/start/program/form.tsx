"use client";
import { useActionState, useState } from "react";
import { startProgram, type StartState } from "./actions";
import { ROOT_DOMAIN } from "@/lib/site";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const SPORTS = ["football", "flag football", "basketball", "baseball", "softball", "soccer", "lacrosse", "volleyball", "wrestling", "track and field", "hockey"];

export function StartProgramForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(startProgram, {});
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="sp-name" className="mb-1.5 block text-sm text-soft">Program name</label>
        <input id="sp-name" name="name" value={name} autoComplete="organization" onChange={(e) => { setName(e.target.value); if (!touched) setSlug(toSlug(e.target.value)); }} className={input} />
      </div>
      <div>
        <label htmlFor="sp-slug" className="mb-1.5 block text-sm text-soft">Your web address</label>
        <div className="flex items-center gap-2">
          <input id="sp-slug" name="slug" value={slug} onChange={(e) => { setTouched(true); setSlug(toSlug(e.target.value)); }} className={`${input} tabular`} />
          <span className="flex-none text-sm text-muted">.{ROOT_DOMAIN}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Families and coaches open this link. You can add your own domain later.</p>
      </div>
      <div>
        <label htmlFor="sp-sport" className="mb-1.5 block text-sm text-soft">Main sport</label>
        <select id="sp-sport" name="sport" defaultValue={state.values?.sport ?? "football"} className={`${input} capitalize`}>
          {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <label className="flex min-h-11 items-start gap-2 text-sm text-soft">
        <input type="checkbox" name="adult" className="mt-0.5 size-5 flex-none" />
        <span>I&apos;m 18 or older and I&apos;m allowed to run this program.</span>
      </label>
      <div aria-live="polite" className="text-sm">{state.error ? <span role="alert" className="text-bad">{state.error}</span> : null}</div>
      <button disabled={pending} className="min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {pending ? "Creating…" : "Create my program"}
      </button>
    </form>
  );
}
