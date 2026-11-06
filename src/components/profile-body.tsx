import { type Source } from "@/lib/domain/metrics";
import { StatShowcase } from "./stat-showcase";
import { Player } from "./player";
import { heroBackground } from "@/lib/domain/brand";

export type ProfileData = {
  first_name: string; last_name: string; position: string | null; grad_year: number | null; attended: number;
  sport: string; bio: string | null; hometown: string | null; gpa: number | null; intended_major: string | null; highlight_url: string | null;
  timeline: { org: string; team: string | null; level: string | null; position: string | null; started_on: string; ended_on: string | null; confirmed: boolean }[];
  programs: { name: string }[];
  results: { metric: string; value: number; source: Source; method: string | null; recorded_at: string; org: string | null }[];
  highlights: { title: string; url: string; kind: string }[];
  theme_color?: string | null;
  featured?: string[] | null;
  reported?: { metric: string; value: number; recorded_at: string; proof_url: string | null }[];
};

/** The athlete card: shared by the recruiting link (/p) and the network profile (/a). */
export function ProfileBody({ p, photo, children }: { p: ProfileData; photo?: string | null; children?: React.ReactNode }) {
  const rows = [...p.results, ...(p.reported ?? []).map((r) => ({ ...r, source: "self_reported" as const, method: null, org: null }))];
  const my = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const sport = (p.sport ?? "").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <>
      <div className="relative flex min-h-[240px] flex-col justify-end overflow-hidden rounded-[14px] border border-line p-5"
        style={{ background: heroBackground(p.theme_color, false), ...(p.theme_color ? { ["--color-gold" as string]: p.theme_color } : {}) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt={`${p.first_name} ${p.last_name}`} className="absolute inset-0 size-full object-cover" /> : null}
        {photo ? <div aria-hidden="true" className="absolute inset-0" style={{ background: heroBackground(p.theme_color, true) }} /> : null}
        {photo ? <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0)_30%,rgba(7,7,7,0.92)_92%)]" /> : null}
        <div className="relative">
          <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-cream/80">{p.programs.map((x) => x.name).join(" · ") || "Athlete"}</div>
          <h1 className="mt-1 font-display text-[44px] uppercase leading-none">{p.first_name} {p.last_name}</h1>
          <div className="mt-2 text-soft">{[sport, p.position, p.grad_year ? `Class of ${p.grad_year}` : null, p.hometown].filter(Boolean).join(" · ")}</div>
          <div className="mt-1 text-xs text-muted">{p.attended} training session{Number(p.attended) === 1 ? "" : "s"} attended</div>
          {children}
        </div>
      </div>

      {p.bio ? <p className="text-[15px] leading-relaxed text-soft">{p.bio}</p> : null}
      {p.highlight_url ? <Player id="" storagePath={p.highlight_url} title={`${p.first_name}'s highlight reel`} /> : null}

      <StatShowcase rows={rows} picks={p.featured} />
      {rows.length ? <p className="text-xs text-muted">✓ Verified numbers are from timed testing events; coach-logged numbers are recorded by the athlete&apos;s program coaches. Self-reported numbers are labeled, with proof links when the athlete added one.</p> : null}

      {p.timeline.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Career</h2>
          <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
            {p.timeline.map((t, i) => (
              <li key={i}>
                <div className="font-semibold">{t.org} {t.confirmed ? <span className="text-xs font-normal text-good">confirmed</span> : null}</div>
                <div className="text-sm text-soft">{[t.team, t.position].filter(Boolean).join(" · ")}</div>
                <div className="text-xs text-muted">{my(t.started_on)} to {t.ended_on ? my(t.ended_on) : "now"}</div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {p.gpa || p.intended_major ? (
        <section className="flex gap-6 text-sm">
          {p.gpa ? <span><span className="text-muted">GPA </span><span className="font-semibold">{Number(p.gpa).toFixed(2)}</span></span> : null}
          {p.intended_major ? <span><span className="text-muted">Intended major </span><span className="font-semibold">{p.intended_major}</span></span> : null}
        </section>
      ) : null}

      {p.highlights.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Highlights</h2>
          {p.highlights.map((h, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Player id="" storagePath={h.url} title={h.title} />
              <div className="text-sm font-semibold">{h.title} <span className="font-normal text-muted">· {h.kind === "game" ? "Game" : "Training"}</span></div>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
