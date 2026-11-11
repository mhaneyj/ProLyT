import Link from "next/link";

export type EventRow = { event_id: string; event: string; starts_on: string; host: string; team: string; division: string; place: number | null; w: number; l: number; t: number };

const medal = (p: number | null) => (p === 1 ? "🏆 Champions" : p === 2 ? "🥈 Runner-up" : null);

/** Tournaments played, with team record and finish. Stays on the profile for good. */
export function EventHistory({ rows }: { rows: EventRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Tournaments</div>
      {rows.map((r) => (
        <Link key={r.event_id} href={`/e/${r.event_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3 hover:border-gold">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{r.event}</span>
            <span className="block truncate text-[12px] text-muted">{new Date(`${r.starts_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {r.team} · {r.division}</span>
          </span>
          <span className="flex-none text-right">
            {medal(r.place) ? <span className="block text-[13px] font-bold text-gold">{medal(r.place)}</span> : null}
            <span className="block tabular text-[13px] text-soft">{r.w}–{r.l}{r.t ? `–${r.t}` : ""}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
