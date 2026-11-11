import Link from "next/link";
import { notFound } from "next/navigation";
import { meOrSignIn } from "@/lib/flow";
import { asUser } from "@/lib/db";
import { isPass, origin, qrSvg } from "@/lib/event-day";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice } from "@/components/ui";

export const metadata = { title: "Event pass" };

type P = { pass_code: string; athlete_id: string; first_name: string; event_id: string; event: string; starts_on: string; location: string | null;
  team: string; division: string; checked_in_at: string | null; problems: string[] };

export default async function Pass({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isPass(code)) notFound();
  const me = await meOrSignIn(`/pass/${code}`);
  const [p] = await asUser(me.id, (q) => q<P>("select pass_code, athlete_id, first_name, event_id, event, starts_on::text, location, team, division, checked_in_at, problems from my_event_passes() where pass_code = $1", [code]));
  if (!p) return <><h1 className="font-display text-[30px] uppercase">Pass not found</h1><p className="text-soft">This pass belongs to another family, or the event is over.</p></>;
  const svg = await qrSvg(`${await origin()}/checkin/${code}`);
  const when = new Date(`${p.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <>
      {!p.checked_in_at ? <AutoRefresh seconds={8} /> : null}
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{p.event} · {when}</div>
        <h1 className="font-display text-[44px] uppercase leading-none">{p.first_name}</h1>
        <div className="text-sm text-soft">{p.team} · {p.division}</div>
      </div>
      {p.checked_in_at ? (
        <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border-2 border-good bg-good/10 px-4 py-10 text-center">
          <div aria-hidden="true" className="text-[64px] leading-none text-good">✓</div>
          <div className="font-display text-[32px] uppercase leading-none">Checked in</div>
          <div className="text-sm text-soft">{new Date(p.checked_in_at).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" })}. Have a great game, {p.first_name}.</div>
        </div>
      ) : (
        <>
          <div aria-label={`Check-in code for ${p.first_name}`} role="img" className="mx-auto w-full max-w-[320px] rounded-2xl bg-white p-4 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-center text-sm text-soft">Show this at check-in. Turn your screen brightness up.</p>
          {p.problems.length ? <Notice tone="bad">Fix before check-in: {p.problems.join(", ")}.{p.problems.includes("Age not verified") ? " Upload the age document from the team link or the athlete's profile." : ""}</Notice> : null}
        </>
      )}
      <Link href={`/e/${p.event_id}`} className="flex min-h-12 items-center justify-center rounded-md border border-line text-sm font-semibold">Schedule and live scores →</Link>
    </>
  );
}
