"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { BOUNDS, METRICS } from "@/lib/domain/metrics";

export type ActionState = { ok?: string; error?: string; values?: { athlete?: string; metric?: string; value?: string } };

export async function checkIn(form: FormData) {
  const me = await requireRole("coach", "owner");
  const session = String(form.get("session"));
  const athlete = String(form.get("athlete"));
  const status = String(form.get("status"));
  if (!["present", "absent", "excused"].includes(status)) return;
  await asUser(me.id, (q) => q("select check_in($1, $2, $3::attendance_status)", [session, athlete, status]));
  revalidatePath(`/coach/session/${session}`);
}

const resultSchema = z.object({
  session: z.guid(),
  athlete: z.guid("Pick an athlete"),
  metric: z.string().refine((m) => m in METRICS, "Pick a test"),
  value: z.coerce.number({ error: "Enter a number" }).positive("Enter a number above zero"),
  note: z.string().trim().max(280).optional(),
});

export async function logResult(prev: ActionState, form: FormData): Promise<ActionState> {
  const out = await save(form);
  // Keep athlete and test selected for the next entry; keep the number only if it needs fixing.
  const values = { athlete: String(form.get("athlete") ?? ""), metric: String(form.get("metric") ?? ""), value: out.error ? String(form.get("value") ?? "") : "" };
  return { ...out, values };
}

async function save(form: FormData): Promise<ActionState> {
  const me = await requireRole("coach", "owner");
  const p = resultSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const m = METRICS[d.metric];
  // Guard against obvious typos (e.g. 52.1 for a 5.21 40-yard dash)
  const bounds: Record<string, [number, number]> = { "40yd": [3.8, 9], pro_agility: [3.5, 8], vertical: [5, 50], broad: [30, 150], sled_lb: [20, 1500], bench_reps: [1, 60] };
  const [lo, hi] = bounds[d.metric];
  if (d.value < lo || d.value > hi) return { error: `${m.label} should be between ${lo} and ${hi} ${m.unit}. Check for a typo.` };
  try {
    await asUser(me.id, (q) =>
      q("insert into results (athlete_id, session_id, metric, value, unit, source, note) values ($1,$2,$3,$4,$5,'coach_logged',$6)",
        [d.athlete, d.session, d.metric, d.value, m.unit, d.note || null]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath(`/coach/session/${d.session}`);
  return { ok: `Saved ${m.label}: ${d.value} ${m.unit}` };
}

export async function addToSession(form: FormData) {
  const me = await requireRole("coach", "owner");
  const session = String(form.get("session"));
  const athlete = String(form.get("athlete"));
  if (!z.guid().safeParse(athlete).success) return;
  // booking_staff policy: staff of this session's program, athlete connected to it
  await asUser(me.id, (q) => q("insert into session_athletes (session_id, athlete_id) values ($1, $2) on conflict do nothing", [session, athlete]));
  revalidatePath(`/coach/session/${session}`);
}

export async function removeFromSession(form: FormData) {
  const me = await requireRole("coach", "owner");
  const session = String(form.get("session"));
  const athlete = String(form.get("athlete"));
  await asUser(me.id, (q) => q(
    "delete from session_athletes sa where session_id = $1 and athlete_id = $2 and not exists (select 1 from attendance a where a.session_id = sa.session_id and a.athlete_id = sa.athlete_id)",
    [session, athlete]));
  revalidatePath(`/coach/session/${session}`);
}


export type BatchState = { ok?: string; error?: string; bad?: Record<string, string>; values?: Record<string, string> };

/** Quick entry: one test, a number for each athlete, one Save. Blank boxes are skipped. */
export async function saveBatch(_: BatchState, form: FormData): Promise<BatchState> {
  const me = await requireRole("coach", "owner");
  const session = String(form.get("session") ?? "");
  const metric = String(form.get("metric") ?? "");
  const m = METRICS[metric];
  if (!m || !z.guid().safeParse(session).success) return { error: "Pick a test" };
  const entries = [...form.entries()].filter(([k, v]) => k.startsWith("v:") && String(v).trim() !== "")
    .map(([k, v]) => ({ athlete: k.slice(2), raw: String(v).trim() }));
  const values = Object.fromEntries(entries.map((e) => [e.athlete, e.raw]));
  if (!entries.length) return { error: "Enter at least one number" };
  const [lo, hi] = BOUNDS[metric];
  const bad: Record<string, string> = {};
  for (const e of entries) {
    const n = Number(e.raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) bad[e.athlete] = "Enter a number";
    else if (n < lo || n > hi) bad[e.athlete] = `Check for a typo (${lo}–${hi} ${m.unit})`;
  }
  if (Object.keys(bad).length) return { error: "Fix the highlighted numbers. Nothing was saved yet.", bad, values };
  try {
    await asUser(me.id, async (q) => {
      for (const e of entries) {
        if (!z.guid().safeParse(e.athlete).success) continue;
        await q("insert into results (athlete_id, session_id, metric, value, unit, source) values ($1,$2,$3,$4,$5,'coach_logged')",
          [e.athlete, session, metric, Number(e.raw.replace(",", ".")), m.unit]);
      }
    });
  } catch (err) {
    return { error: dbMessage(err), values };
  }
  revalidatePath(`/coach/session/${session}`);
  return { ok: `Saved ${entries.length} ${m.label} result${entries.length > 1 ? "s" : ""}. Families see them now.` };
}

export async function toggleHere(form: FormData) {
  const me = await requireRole("coach", "owner");
  const session = String(form.get("session")), athlete = String(form.get("athlete"));
  const next = form.get("here") === "1" ? "absent" : "present";
  await asUser(me.id, (q) => q("select check_in($1, $2, $3::attendance_status)", [session, athlete, next]));
  revalidatePath(`/coach/session/${session}`);
}

export async function allHere(form: FormData) {
  const me = await requireRole("coach", "owner");
  const session = String(form.get("session"));
  await asUser(me.id, async (q) => {
    const rows = await q<{ athlete_id: string }>(`
      select sa.athlete_id from session_athletes sa
      where sa.session_id = $1 and not exists (select 1 from attendance a where a.session_id = $1 and a.athlete_id = sa.athlete_id)`, [session]);
    for (const r of rows) await q("select check_in($1, $2, 'present')", [session, r.athlete_id]);
  });
  revalidatePath(`/coach/session/${session}`);
}

const voiceSchema = z.object({
  session: z.guid(),
  metric: z.string().refine((m) => m in METRICS),
  items: z.array(z.object({
    athleteId: z.guid(),
    value: z.number().positive().nullable(),
    note: z.string().trim().max(1000).nullable(),
    focus: z.string().trim().max(200).nullable(),
  })).min(1).max(60),
});

/** Saves what the coach confirmed from a spoken log: results plus notes. */
export async function saveVoice(input: z.infer<typeof voiceSchema>): Promise<{ ok?: string; error?: string }> {
  const me = await requireRole("coach", "owner");
  const p = voiceSchema.safeParse(input);
  if (!p.success) return { error: "Nothing to save yet" };
  const { session, metric, items } = p.data;
  const m = METRICS[metric];
  const [lo, hi] = BOUNDS[metric];
  const off = items.find((i) => i.value !== null && (i.value < lo || i.value > hi));
  if (off) return { error: `Check ${off.value} ${m.unit}: ${m.label} should be ${lo}–${hi} ${m.unit}. Fix it, then save.` };
  let results = 0, notes = 0;
  try {
    await asUser(me.id, async (q) => {
      const [s] = await q<{ org_id: string }>("select org_id from sessions where id = $1", [session]);
      if (!s) throw new Error("Unknown session");
      for (const i of items) {
        if (i.value !== null) {
          await q("insert into results (athlete_id, session_id, metric, value, unit, source) values ($1,$2,$3,$4,$5,'coach_logged')", [i.athleteId, session, metric, i.value, m.unit]);
          results++;
        }
        if (i.note && i.note.length >= 2) {
          await q("insert into coach_notes (athlete_id, org_id, coach_id, session_id, body, focus) values ($1,$2,$3,$4,$5,$6)",
            [i.athleteId, s.org_id, me.id, session, i.note, i.focus || null]);
          notes++;
        }
      }
    });
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath(`/coach/session/${session}`);
  const parts = [results ? `${results} result${results > 1 ? "s" : ""}` : null, notes ? `${notes} note${notes > 1 ? "s" : ""}` : null].filter(Boolean);
  return { ok: `Saved ${parts.join(" and ")}. Families see them now.` };
}
