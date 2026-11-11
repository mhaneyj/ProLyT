import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { asService } from "@/lib/db";
import { themeVars } from "@/lib/domain/brand";
import { Kicker, LinkButton } from "@/components/ui";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

type Ev = { id: string; name: string; starts_on: string; location: string | null; status: string };

const FAMILY = [
  ["Verified numbers", "40, shuttle, vertical and more, measured by coaches and shown with a ✓."],
  ["Film that follows them", "Clips and highlights from every season in one profile."],
  ["Everything in one app", "Schedule, booking, coach notes, messages and event passes."],
];
const PROGRAM = [
  ["Run your program", "Schedules, booking, payments, attendance and coach pay."],
  ["Host events", "Divisions, age checks, waivers, QR check-in, brackets and live scores."],
  ["Give every athlete a profile", "Verified stats, film and a record that grows with them."],
];

export default async function Welcome() {
  const me = await getMe();
  if (me) redirect(homeFor(me));
  const brand = await brandBySlug(await currentOrgSlug());
  // Upcoming public events from this program: a reason to come back, and a way in without an account.
  const events = brand ? await asService((q) => q<Ev>(`select id, name, starts_on::text, location, status from events
    where org_id = $1 and status in ('open', 'closed', 'live') and coalesce(ends_on, starts_on) >= current_date - 1 order by starts_on limit 3`, [brand.id])).catch(() => []) : [];
  const points = brand ? FAMILY : PROGRAM;

  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={88} /> : <ProLytMark className="text-4xl" />}
      <div className="flex flex-col gap-4">
        <Kicker>{brand ? `${brand.name} · Athlete portal` : "Athlete development platform"}</Kicker>
        <h1 className="font-display text-[52px] uppercase leading-[0.95]">
          Train it.
          <br />
          Track it.
          <br />
          <span className="text-gold">ProLyt.</span>
        </h1>
        <p className="text-soft">{brand
          ? `Your athlete's progress with ${brand.name}, highlighted: schedule, verified results, film and coach notes in one place.`
          : "The athlete profile, team app and event platform for youth and high school football programs."}</p>
      </div>

      {events.length ? (
        <section aria-label="Events" className="flex flex-col gap-2">
          {events.map((e) => (
            <Link key={e.id} href={`/e/${e.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-[14px] border-2 border-gold bg-gold/10 px-4">
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[2px] text-gold">{e.status === "live" ? "● Live now" : new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="block truncate font-semibold">{e.name}</span>
              </span>
              <span className="flex-none text-sm font-bold text-gold">{e.status === "live" ? "Scores →" : "Details →"}</span>
            </Link>
          ))}
        </section>
      ) : null}

      <ul className="flex flex-col gap-3">
        {points.map(([h, t]) => (
          <li key={h} className="flex gap-3">
            <span aria-hidden="true" className="mt-1 size-2.5 flex-none rounded-full bg-gold" />
            <span><span className="block font-semibold">{h}</span><span className="block text-sm text-soft">{t}</span></span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <LinkButton href="/login">Sign in</LinkButton>
        {brand ? <LinkButton href="/register" kind="ghost">Register an athlete</LinkButton> : null}
        <nav aria-label="Legal" className="flex justify-center gap-4 text-[12px] text-muted">
          <Link href="/legal/privacy" className="min-h-11 py-3 hover:text-cream">Privacy</Link>
          <Link href="/legal/participation" className="min-h-11 py-3 hover:text-cream">Terms</Link>
        </nav>
        {brand ? <div className="text-center"><PoweredBy /></div> : null}
      </div>
    </main>
  );
}
