import Link from "next/link";
import { notFound } from "next/navigation";
import { meOrSignIn } from "@/lib/flow";
import { asUser } from "@/lib/db";
import { isPass } from "@/lib/event-day";
import { checkIn, undoCheckIn } from "@/app/(app)/day/actions";
import { Notice, Pill } from "@/components/ui";

export const metadata = { title: "Check-in" };

type L = { event_id: string; event: string; athlete_id: string; name: string; pos: string | null; jersey_team: string; division: string; has_photo: boolean;
  age_verified: boolean; age_at_cutoff: number | null; grade: number | null; problems: string[]; checked_in_at: string | null; checkin_note: string | null };

export default async function CheckIn({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string; done?: string; reason?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  if (!isPass(code)) notFound();
  const me = await meOrSignIn(`/checkin/${code}`);
  const [l] = await asUser(me.id, (q) => q<L>("select * from checkin_lookup($1)", [code]));
  if (!l) return (
    <>
      <h1 className="font-display text-[30px] uppercase">Event pass</h1>
      <p className="text-soft">This is an athlete&apos;s pass for check-in. Only the event&apos;s check-in staff can open it.</p>
      <Link href="/home" className="text-sm font-semibold text-gold">Go to ProLyt</Link>
    </>
  );
  const time = (d: string) => new Date(d).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
  const ok = l.problems.length === 0;
  return (
    <>
      {sp.done ? <Notice tone="good">{l.name} is checked in.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <div className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center ${l.checked_in_at ? "border-good bg-good/10" : ok ? "border-line" : "border-bad bg-bad/5"}`}>
        {l.has_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photo/${l.athlete_id}`} alt={`${l.name}'s profile photo`} className="size-44 rounded-full border-4 border-gold object-cover" />
        ) : <div className="flex size-44 items-center justify-center rounded-full border-4 border-line text-sm text-muted">No photo on file</div>}
        <div>
          <h1 className="font-display text-[34px] uppercase leading-none">{l.name}</h1>
          <div className="mt-1 text-sm text-soft">{[l.jersey_team, l.division, l.pos].filter(Boolean).join(" · ")}</div>
          <div className="text-sm text-soft">{[l.age_at_cutoff != null ? `Age ${l.age_at_cutoff} on cutoff` : null, l.grade != null ? `Grade ${l.grade}` : null].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {l.age_verified ? <Pill tone="good">✓ Age verified</Pill> : <Pill tone="muted">Age not verified</Pill>}
          {l.problems.map((p) => <Pill key={p} tone="bad">{p}</Pill>)}
        </div>
      </div>
      {l.checked_in_at ? (
        <>
          <p className="text-center text-sm text-good">Checked in at {time(l.checked_in_at)}{l.checkin_note ? ` · ${l.checkin_note}` : ""}</p>
          <Link href={`/day/${l.event_id}/scan`} className="flex min-h-14 items-center justify-center rounded-md bg-gold text-lg font-bold text-on-gold">Scan next</Link>
          <form action={undoCheckIn}><input type="hidden" name="code" value={code} /><button className="min-h-11 w-full text-sm text-muted">Undo check-in</button></form>
        </>
      ) : ok ? (
        <form action={checkIn}><input type="hidden" name="code" value={code} />
          <button className="min-h-16 w-full rounded-md bg-good text-xl font-bold text-ink">Check in</button></form>
      ) : (
        <form action={checkIn} className="flex flex-col gap-2">
          <input type="hidden" name="code" value={code} />
          <label className="text-xs text-soft">Check in anyway? Say why
            <input name="note" required minLength={3} maxLength={300} autoFocus={Boolean(sp.reason)} placeholder="Showed birth certificate at the desk" className="mt-1 min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /></label>
          <button className="min-h-12 rounded-md border-2 border-bad font-bold text-bad">Check in with reason</button>
        </form>
      )}
      <Link href={`/day/${l.event_id}`} className="text-center text-sm text-muted">← {l.event} check-in desk</Link>
    </>
  );
}
