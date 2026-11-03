"use client";
import { useActionState, useState } from "react";
import { createProgram, inviteOwner, setDomain, type AdminState } from "./actions";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function NewProgramForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createProgram, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label htmlFor="p-name" className="mb-1.5 block text-sm text-soft">Program name</label>
        <input id="p-name" name="name" value={name} onChange={(e) => { setName(e.target.value); if (!touched) setSlug(toSlug(e.target.value)); }} className={input} />
      </div>
      <div>
        <label htmlFor="p-slug" className="mb-1.5 block text-sm text-soft">Web address</label>
        <div className="flex items-center gap-2">
          <input id="p-slug" name="slug" value={slug} onChange={(e) => { setTouched(true); setSlug(toSlug(e.target.value)); }} className={`${input} tabular`} />
          <span className="flex-none text-sm text-muted">.prolyt.com</span>
        </div>
      </div>
      <div>
        <label htmlFor="p-owner" className="mb-1.5 block text-sm text-soft">Owner&apos;s email</label>
        <input id="p-owner" name="owner" type="email" autoComplete="off" className={input} />
      </div>
      <div aria-live="polite" className="text-sm">
        {state.error ? <span role="alert" className="text-bad">{state.error}</span> : state.ok ? <span className="text-good">✓ {state.ok}</span> : null}
      </div>
      <button disabled={pending} className="min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {pending ? "Creating…" : "Create program"}
      </button>
    </form>
  );
}

export function InviteOwnerForm({ orgId, name }: { orgId: string; name: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(inviteOwner, {});
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <input type="hidden" name="org" value={orgId} />
      <label htmlFor={`owner-${orgId}`} className="text-xs text-soft">Invite an owner for {name}</label>
      <div className="flex gap-2">
        <input id={`owner-${orgId}`} name="email" type="email" autoComplete="off" placeholder="owner@email.com" className="min-h-11 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-sm text-cream" />
        <button disabled={pending} className="min-h-11 flex-none rounded-md border-2 border-[#3a3a3a] px-3 text-sm font-bold hover:border-gold disabled:opacity-60">{pending ? "…" : "Invite"}</button>
      </div>
      <div aria-live="polite" className="text-xs">
        {state.error ? <span role="alert" className="text-bad">{state.error}</span> : state.ok ? <span className="text-good">✓ {state.ok}</span> : null}
      </div>
    </form>
  );
}

export function DomainForm({ orgId, current }: { orgId: string; current: string | null }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(setDomain, {});
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <input type="hidden" name="org" value={orgId} />
      <label htmlFor={`domain-${orgId}`} className="text-xs text-soft">Program&apos;s own app address (optional)</label>
      <div className="flex gap-2">
        <input id={`domain-${orgId}`} name="domain" defaultValue={current ?? ""} placeholder="app.yourprogram.com" autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-sm text-cream" />
        <button disabled={pending} className="min-h-11 flex-none rounded-md border-2 border-[#3a3a3a] px-3 text-sm font-bold hover:border-gold disabled:opacity-60">{pending ? "…" : "Save"}</button>
      </div>
      <div aria-live="polite" className="text-xs">
        {state.error ? <span role="alert" className="text-bad">{state.error}</span> : state.ok ? <span className="text-good">✓ {state.ok}</span> : null}
      </div>
    </form>
  );
}
