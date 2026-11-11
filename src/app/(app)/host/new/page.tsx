import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { PRESETS, WAIVER_TEMPLATE } from "@/lib/domain/events";
import { Button, Notice, Title } from "@/components/ui";
import { createEvent } from "../actions";

export const metadata = { title: "Host an event" };

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await requireMe();
  if (!me.orgId || !(me.roles.includes("owner") || me.roles.includes("coach"))) redirect(homeFor(me));
  const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  const label = "mb-1 block text-sm font-semibold";
  return (
    <>
      <Link href="/host" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Events</Link>
      <Title>Host an event</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <form action={createEvent} className="flex flex-col gap-4">
        <div><label htmlFor="name" className={label}>Event name</label><input id="name" name="name" required placeholder="Loomis 7v7 Classic" className={input} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label htmlFor="starts_on" className={label}>Starts</label><input id="starts_on" name="starts_on" type="date" required className={input} /></div>
          <div><label htmlFor="ends_on" className={label}>Ends (optional)</label><input id="ends_on" name="ends_on" type="date" className={input} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label htmlFor="kind" className={label}>Type</label>
            <select id="kind" name="kind" className={input}><option value="tournament">Tournament</option><option value="combine">Combine</option><option value="camp">Camp</option></select></div>
          <div><label htmlFor="closes" className={label}>Registration closes</label><input id="closes" name="closes" type="date" className={input} /></div>
        </div>
        <div><label htmlFor="location" className={label}>Where</label><input id="location" name="location" placeholder="Del Oro High School, Loomis" className={input} /></div>
        <fieldset className="flex flex-col gap-2">
          <legend className={label}>Divisions</legend>
          {Object.entries(PRESETS).map(([k, p], i) => (
            <label key={k} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-gold">
              <input type="radio" name="preset" value={k} defaultChecked={i === 0} className="mt-1 size-5 accent-[var(--color-gold)]" />
              <span><span className="block font-semibold">{p.label}</span><span className="block text-[12px] text-muted">{p.help}</span></span>
            </label>
          ))}
          <p className="text-[12px] text-muted">You can rename, change or add divisions after.</p>
        </fieldset>
        <div>
          <label htmlFor="waiver" className={label}>Waiver families sign</label>
          <textarea id="waiver" name="waiver" rows={7} defaultValue={WAIVER_TEMPLATE} className="w-full rounded-md border border-[#333] bg-[#111] p-3 text-[14px] text-cream" />
        </div>
        <Button type="submit">Create event</Button>
        <p className="text-[12px] text-muted">It starts as a draft. Open registration when you&apos;re ready to share it.</p>
      </form>
    </>
  );
}
