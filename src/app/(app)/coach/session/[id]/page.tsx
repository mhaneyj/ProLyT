import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ageOn, dayTime } from "@/lib/domain/format";
import { METRICS } from "@/lib/domain/metrics";
import { Card, Empty, Notice, SectionLabel, Title } from "@/components/ui";
import { checkIn } from "./actions";
import { LogForm } from "./log-form";

export const metadata = { title: "Session" };

type R = { id: string; first_name: string; last_name: string; position: string | null; birth_date: string; status: string | null; allergies: string | null };

const STATUS = [
  { v: "present", label: "Here", on: "bg-good text-ink border-good" },
  { v: "absent", label: "Absent", on: "bg-bad text-ink border-bad" },
  { v: "excused", label: "Excused", on: "bg-[#3a3a3a] text-cream border-[#3a3a3a]" },
] as const;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireRole("coach", "owner");
  const data = await asUser(me.id, async (q) => {
    const [s] = await q<{ id: string; title: string; starts_at: string; kind: string }>("select id, title, starts_at, kind from sessions where id = $1", [id]);
    if (!s) return null;
    const roster = await q<R>(`
      select a.id, a.first_name, a.last_name, a.position, a.birth_date::text, at.status, mn.allergies
      from session_athletes sa join athletes a on a.id = sa.athlete_id
      left join attendance at on at.session_id = sa.session_id and at.athlete_id = a.id
      left join medical_notes mn on mn.athlete_id = a.id
      where sa.session_id = $1 order by a.first_name`, [id]);
    return { s, roster };
  });
  if (!data) notFound();
  const { s, roster } = data;
  const allergyNotes = roster.filter((r) => r.allergies && r.allergies.toLowerCase() !== "none");

  return (
    <>
      <Link href="/coach" className="text-sm font-semibold">← Today</Link>
      <Title sub={dayTime(s.starts_at)}>{s.title}</Title>
      {allergyNotes.length ? (
        <Notice>
          {allergyNotes.map((r) => <div key={r.id}><span className="font-semibold text-cream">{r.first_name}:</span> {r.allergies}</div>)}
        </Notice>
      ) : null}

      <SectionLabel right={<span className="text-sm text-muted">{roster.filter((r) => r.status).length}/{roster.length} marked</span>}>Check-in</SectionLabel>
      {roster.length === 0 ? <Empty title="No one booked" /> : null}
      {roster.map((r) => (
        <Card key={r.id} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{r.first_name} {r.last_name}</span>
            <span className="text-xs text-muted">{[r.position, `Age ${ageOn(r.birth_date)}`].filter(Boolean).join(" · ")}</span>
          </div>
          <form action={checkIn} className="grid grid-cols-3 gap-2">
            <input type="hidden" name="session" value={s.id} />
            <input type="hidden" name="athlete" value={r.id} />
            {STATUS.map((st) => (
              <button key={st.v} name="status" value={st.v} aria-pressed={r.status === st.v}
                className={`min-h-12 rounded-md border text-sm font-bold ${r.status === st.v ? st.on : "border-line text-soft hover:border-gold"}`}>
                {st.label}
              </button>
            ))}
          </form>
        </Card>
      ))}

      {roster.length ? (
        <Card>
          <SectionLabel>Log a result</SectionLabel>
          <p className="mb-3 mt-1 text-xs text-muted">Saved as coach-logged. Families see it on their progress page right away.</p>
          <LogForm
            session={s.id}
            athletes={roster.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` }))}
            metrics={Object.entries(METRICS).filter(([k]) => k !== "bench_reps").map(([key, m]) => ({ key, label: m.label, unit: m.unit }))}
          />
        </Card>
      ) : null}
    </>
  );
}
