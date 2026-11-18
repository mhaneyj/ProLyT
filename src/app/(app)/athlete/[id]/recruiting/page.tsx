import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadPlayerCard } from "@/lib/cards";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { loadAthlete } from "../header";
import { answerInterest, saveRecruiting } from "./actions";

export const metadata = { title: "College Coach Pass" };

const STATES = [
  { key: "hidden", title: "Hidden", body: "No college coach can see this profile. This is the default." },
  { key: "visible", title: "Visible", body: "Verified college coaches can look at the profile and keep their own private notes. They cannot contact you." },
  { key: "open", title: "Open to outreach", body: "Visible, plus a coach can tell you they're interested. You decide whether to accept. Only then can that coach message the parent account." },
] as const;
const FIELD_LABELS: [string, string][] = [
  ["results", "Verified test results"], ["film", "Highlight film link"], ["school", "School"], ["hometown", "Hometown"], ["academics", "GPA and intended major"],
];
const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  state_changed: (d) => `Setting changed from ${d.from} to ${d.to}`,
  fields_changed: (d) => `Shared details changed: ${(d.fields as string[]).length ? (d.fields as string[]).join(", ") : "none"}`,
  viewed: (d) => `${d.name ?? "A coach"}${d.title ? `, ${d.title}` : ""}, at ${d.school} viewed this profile`,
  interest: (d) => `${d.name ?? "A coach"}${d.title ? `, ${d.title}` : ""}, at ${d.school} said they're interested`,
  interest_decided: (d) => d.accepted ? `You accepted ${d.school}` : d.blocked ? `You declined ${d.school} and blocked the school` : `You declined ${d.school}`,
  message: (d) => `${d.name ?? "A coach"}${d.title ? `, ${d.title}` : ""}, at ${d.school} sent a message`,
  interest_closed: (d) => d.blocked ? `You ended the conversation with ${d.school} and blocked the school` : `You ended the conversation with ${d.school}`,
  reported: (d) => `You reported a coach at ${d.school}. Their account was frozen and ProLyt will review it`,
  interest_withdrawn: (d) => `${d.school} withdrew their interest`,
  program_toggled: (d) => `The program turned College Coach Pass ${d.on ? "on" : "off"}`,
};

export default async function Recruiting({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/recruiting");
  const d = await asUser(me.id, async (q) => {
    const [r] = await q<{ guardian: boolean; state: "hidden" | "visible" | "open"; fields: string[]; eligible: boolean; effective: string; enabled: boolean;
      age: number; school: string | null; hometown: string | null; gpa: string | null; major: string | null; show_ac: boolean; grad: number | null }>(`
      select is_guardian(a.id) guardian, a.recruiting_state state, a.recruiting_fields fields, recruit_eligible(a.id) eligible, recruiting_effective(a.id) effective,
        exists (select 1 from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active' and o.recruiting_enabled) enabled,
        age_on(a.birth_date) age, a.school, a.hometown, a.gpa::text, a.intended_major major, a.show_academics show_ac, a.grad_year grad
      from athletes a where a.id = $1`, [id]);
    const log = await q<{ kind: string; detail: Record<string, unknown>; created_at: string }>(
      "select kind, detail, created_at::text from recruiting_events where athlete_id = $1 order by created_at desc, id limit 20", [id]);
    const asks = await q<{ id: string; school: string; level: string; name: string | null; title: string | null; role: string; status: string; created_at: string }>(
      "select id, school, level, name, title, role, status, created_at::text from family_interests($1)", [id]);
    return { r, log, asks };
  });
  const r = d.r;
  const v = await loadPlayerCard(me.id, id);
  const shown = new Set(r.fields);
  const cannot = r.age < 13 ? "Athletes under 13 can't be shown to colleges." : !r.eligible ? "College Coach Pass is for athletes graduating in the next four classes. Add or fix the graduation year on the card." : null;
  const photo = v?.aiPhoto ?? (a.has_photo ? `/api/photo/${a.id}` : null);

  return (
    <>
      {switcher}
      <Link href={`/athlete/${a.id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {a.first_name}</Link>
      <Title sub="You decide whether college coaches can see this profile, and whether they can reach you.">College Coach Pass</Title>
      {sp.ok ? <Notice tone="good">Saved.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <Notice>College coach accounts aren&apos;t open yet. Your choice is saved now, and nothing is shown to anyone until they open. You&apos;ll be told before that happens.</Notice>
      {!r.enabled ? <Notice>None of {a.first_name}&apos;s programs has turned College Coach Pass on yet, so nothing can be shown. Ask the program owner.</Notice> : null}
      {cannot ? <Notice tone="bad">{cannot}{r.age >= 13 ? <> <Link href={`/athlete/${a.id}/card-info`} className="underline">Edit card info</Link></> : null}</Notice> : null}

      {r.guardian && d.asks.some((x) => x.status === "pending") ? (
        <section className="flex flex-col gap-2" aria-label="Requests">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">Coaches who are interested</h2>
          {d.asks.filter((x) => x.status === "pending").map((x) => (
            <Card key={x.id} accent className="flex flex-col gap-2">
              <div><span className="font-semibold">{x.school}</span> <span className="text-sm text-muted">· {x.level}</span></div>
              <p className="text-sm text-soft">{x.name ?? "A coach"}{x.title ? `, ${x.title}` : ""}, a verified {x.role === "delegate" ? "staff member" : "college coach"}, would like to be able to message you. If you accept, they can message the parent account here. If you decline, they can&apos;t message you.</p>
              <div className="flex flex-wrap gap-2">
                {([["accept", "Accept", "bg-gold text-on-gold"], ["decline", "Decline", "border border-line"], ["block", "Decline and block school", "border border-line"]] as const).map(([choice, label, cls]) => (
                  <form key={choice} action={answerInterest}>
                    <input type="hidden" name="id" value={a.id} /><input type="hidden" name="req" value={x.id} /><input type="hidden" name="choice" value={choice} />
                    <button disabled={choice === "accept" && r.state !== "open"} className={`min-h-11 rounded-md px-4 text-sm font-bold disabled:opacity-40 ${cls}`}>{label}</button>
                  </form>
                ))}
              </div>
              {r.state !== "open" ? <p className="text-xs text-muted">Set {a.first_name} to Open to outreach below to accept.</p> : <p className="text-xs text-muted">Blocking hides {a.first_name} from this school completely. They aren&apos;t told why.</p>}
            </Card>
          ))}
        </section>
      ) : null}

      {r.guardian && d.asks.some((x) => x.status === "accepted") ? (
        <section className="flex flex-col gap-2" aria-label="Conversations">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">Conversations</h2>
          {d.asks.filter((x) => x.status === "accepted").map((x) => (
            <Link key={x.id} href={`/athlete/${a.id}/recruiting/${x.id}`} className="block rounded-[14px] border border-line bg-panel p-3 hover:border-gold">
              <span className="font-semibold">{x.school}</span> <span className="text-sm text-muted">· {x.name ?? "Coach"}{x.title ? `, ${x.title}` : ""}</span>
              <span className="block text-sm text-gold">Open conversation →</span>
            </Link>
          ))}
        </section>
      ) : null}

      {r.guardian ? (
        <form action={saveRecruiting} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={a.id} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Who can see {a.first_name}</legend>
            {STATES.map((s) => (
              <label key={s.key} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-[14px] border border-line bg-panel p-3 has-[:checked]:border-gold">
                <input type="radio" name="state" value={s.key} defaultChecked={r.state === s.key} className="mt-1 size-5 accent-[var(--color-gold)]" />
                <span><span className="block font-semibold">{s.title}</span><span className="block text-sm text-soft">{s.body}</span></span>
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">Details a coach can see <span className="font-normal text-muted">(only if Visible or Open)</span></legend>
            {FIELD_LABELS.map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="fields" value={k} defaultChecked={shown.has(k)} className="size-5 accent-[var(--color-gold)]" /> {label}</label>
            ))}
          </fieldset>
          <button className="min-h-12 rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold">Save</button>
        </form>
      ) : (
        <Card>
          <div className="font-semibold">Current setting: {STATES.find((s) => s.key === r.state)?.title}</div>
          <p className="mt-1 text-sm text-soft">Your parent or guardian decides this setting.</p>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-muted">What a college coach would see</h2>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-lg font-semibold">{a.first_name} {a.last_name}</div>
              <div className="text-sm text-soft">{[a.position, r.grad ? `Class of ${r.grad}` : null].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="grid size-14 place-items-center rounded-lg bg-ink font-display text-[26px] text-gold">{v?.rating.ovr ?? "--"}</div>
          </div>
          {photo ? <div className="text-xs text-muted">The card photo you approved is included.</div> : null}
          {shown.has("results") ? (
            <div><div className="text-sm font-semibold">Test results</div>
              {v?.tests.length ? <ul className="mt-1 text-sm text-soft">{v.tests.map((t) => <li key={t.label}>{t.label}: {t.value} <span className="text-muted">({t.by})</span></li>)}</ul> : <p className="text-sm text-muted">No tests yet.</p>}</div>
          ) : null}
          {shown.has("film") ? <div className="text-sm">{v?.highlight ? "Highlight film link included." : <span className="text-muted">No highlight link yet.</span>}</div> : null}
          {shown.has("school") ? <div className="text-sm">School: {r.school ?? <span className="text-muted">not added</span>}</div> : null}
          {shown.has("hometown") ? <div className="text-sm">Hometown: {r.hometown ?? <span className="text-muted">not added</span>}</div> : null}
          {shown.has("academics") ? <div className="text-sm">{r.gpa || r.major ? `GPA ${r.gpa ?? "n/a"}${r.major ? ` · ${r.major}` : ""}` : <span className="text-muted">No GPA or major added.</span>}</div> : null}
          {shown.size === 0 ? <p className="text-sm text-muted">Only the name, position, graduation year, card photo and overall rating.</p> : null}
        </Card>
        <p className="text-xs text-muted">Never shown: date of birth, address, phone, email, medical information, or any other photo.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-muted">History <Pill>{d.log.length}</Pill></h2>
        {d.log.length === 0 ? <p className="text-sm text-muted">Nothing yet. When college coaches can see profiles, every view, interest and message will be listed here with the school and the person.</p> : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {d.log.map((e, i) => <li key={i} className="flex justify-between gap-3 border-b border-line pb-1.5"><span>{EVENT_TEXT[e.kind]?.(e.detail) ?? e.kind}</span><span className="flex-none text-muted">{e.created_at.slice(0, 10)}</span></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
