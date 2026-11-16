"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asService, asUser, dbMessage } from "@/lib/db";
import { isId, isPass } from "@/lib/event-day";
import { formatValue, METRICS } from "@/lib/domain/metrics";
import { isMethod, isStation, parseBoothValue } from "@/lib/booth";
import { familyOf, pushTo } from "@/lib/push";
import { track } from "@/lib/track";

// Booth results are "verified at an event". Event staff are not coaches of the athlete, so the database's own rule
// (verified results come from the event system only) is satisfied by writing as the service after we check, here,
// that the signed-in person is staff for this event and the athlete is checked in to it.
type Look = { event_id: string; event: string; athlete_id: string; name: string; checked_in_at: string | null };

export async function saveBoothResult(ev: string, code: string, metric: string, raw: string, method: string): Promise<{ error?: string; id?: string; text?: string }> {
  const me = await requireMe();
  if (!isId(ev) || !isPass(code) || !isStation(metric) || !isMethod(method)) return { error: "Bad request" };
  const parsed = parseBoothValue(metric, raw);
  if ("error" in parsed) return { error: parsed.error };
  let look: Look | undefined, orgId: string | undefined;
  try {
    [look] = await asUser(me.id, (q) => q<Look>("select event_id, event, athlete_id, name, checked_in_at from checkin_lookup($1)", [code]));
    [{ org_id: orgId }] = look ? await asUser(me.id, (q) => q<{ org_id: string }>("select org_id from events where id = $1", [ev])) : [{ org_id: undefined }];
  } catch (e) { return { error: dbMessage(e) }; }
  if (!look || look.event_id !== ev || !orgId) return { error: "That pass isn't for this event" };
  if (!look.checked_in_at) return { error: `${look.name} isn't checked in yet` };
  let id: string;
  try {
    [{ id }] = await asService((q) => q<{ id: string }>(
      `insert into results (athlete_id, org_id, metric, value, unit, source, logged_by, method, note)
       values ($1, $2, $3, $4, $5, 'verified_event', $6, $7, $8) returning id`,
      [look!.athlete_id, orgId, metric, parsed.value, METRICS[metric].unit, me.id, method, `At ${look!.event}`]));
  } catch (e) { return { error: dbMessage(e) }; }
  await track("booth_result", { userId: me.id, props: { event: ev, metric } });
  const first = look.name.split(" ")[0], text = formatValue(metric, parsed.value), athlete = look.athlete_id;
  after(async () => {
    await pushTo(await familyOf(athlete), { title: `${first}: ${METRICS[metric].label} ${text}`, body: "Verified at the event. Open the card to see it move.", url: `/athlete/${athlete}/cards`, tag: `booth-${athlete}-${metric}` });
  });
  revalidatePath(`/athlete/${athlete}/cards`);
  return { id, text };
}

/** Undo a typo from the last few hours. Results are never edited, only voided. */
export async function voidBoothResult(ev: string, resultId: string): Promise<{ error?: string }> {
  const me = await requireMe();
  if (!isId(ev) || !isId(resultId)) return { error: "Bad request" };
  const staff = await asUser(me.id, (q) => q<{ s: boolean }>("select is_event_staff($1) s", [ev]));
  if (!staff[0]?.s) return { error: "Only event staff can do that" };
  const done = await asService((q) => q<{ id: string }>(
    `update results set voided_at = now(), void_reason = 'Entered in error at the booth'
     where id = $1 and source = 'verified_event' and voided_at is null and logged_by = $2 and recorded_at > now() - interval '3 hours' returning id`, [resultId, me.id]));
  return done.length ? {} : { error: "Can't undo that one" };
}
