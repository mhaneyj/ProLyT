"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { METRICS } from "@/lib/domain/metrics";

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
