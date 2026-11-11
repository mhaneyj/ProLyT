"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { isId, isPass } from "@/lib/event-day";
import { track } from "@/lib/track";
import { familyOf, notifyGame, pushTo } from "@/lib/push";

export async function checkIn(form: FormData) {
  const me = await requireMe();
  const code = String(form.get("code") ?? "");
  if (!isPass(code)) return;
  const note = String(form.get("note") ?? "").trim() || null;
  try {
    await asUser(me.id, (q) => q("select check_in($1, $2)", [code, note]));
  } catch (e) {
    redirect(`/checkin/${code}?error=${encodeURIComponent(dbMessage(e))}${note ? "" : "&reason=1"}`);
  }
  await track("checked_in", { userId: me.id, props: { override: Boolean(note) } });
  after(async () => {
    const [r] = await asUser(me.id, (q) => q<{ athlete_id: string; name: string; event: string; event_id: string }>(
      "select athlete_id, split_part(name, ' ', 1) name, event, event_id from checkin_lookup($1)", [code]));
    if (r) await pushTo(await familyOf(r.athlete_id), { title: `✓ ${r.name} is checked in`, body: `${r.event}. Follow the scores live.`, url: `/e/${r.event_id}`, tag: `checkin-${code}` });
  });
  redirect(`/checkin/${code}?done=1`);
}

export async function undoCheckIn(form: FormData) {
  const me = await requireMe();
  const code = String(form.get("code") ?? "");
  if (!isPass(code)) return;
  try { await asUser(me.id, (q) => q("select undo_check_in($1)", [code])); } catch (e) { redirect(`/checkin/${code}?error=${encodeURIComponent(dbMessage(e))}`); }
  redirect(`/checkin/${code}`);
}

export async function joinStaff(form: FormData) {
  const me = await requireMe();
  const token = String(form.get("token") ?? "");
  let ev: string;
  try {
    ev = (await asUser(me.id, (q) => q<{ id: string }>("select join_staff($1) id", [token])))[0].id;
  } catch (e) {
    redirect(`/staff/${encodeURIComponent(token)}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  await track("staff_joined", { userId: me.id, props: { event: ev! } });
  redirect(`/day/${ev!}?welcome=1`);
}

export async function setScore(form: FormData) {
  const me = await requireMe();
  const game = form.get("game"), ev = form.get("event");
  if (!isId(game) || !isId(ev)) return;
  const n = (k: string) => Math.max(0, Math.min(999, Number(form.get(k) ?? 0) | 0));
  const status = String(form.get("status") ?? "live");
  let before: string | null = null;
  try {
    before = await asUser(me.id, async (q) => {
      const [g] = await q<{ status: string }>("select status from games where id = $1", [game]);
      await q("select set_score($1, $2, $3, $4)", [game, n("home"), n("away"), status]);
      return g?.status ?? null;
    });
  } catch (e) {
    redirect(`/day/${ev}/game/${game}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  if (status === "final") await track("game_final", { userId: me.id, props: { event: ev } });
  after(() => notifyGame(game, before));
  revalidatePath(`/day/${ev}`);
  revalidatePath(`/e/${ev}`);
  redirect(status === "final" ? `/day/${ev}?final=1#scores` : `/day/${ev}/game/${game}?saved=1`);
}

export async function followTeam(form: FormData) {
  const me = await requireMe();
  const team = form.get("team"), ev = form.get("event");
  if (!isId(team) || !isId(ev)) return;
  const on = form.get("on") === "1";
  await asUser(me.id, (q) => on
    ? q("insert into team_follows (user_id, team_id) values ($1, $2) on conflict do nothing", [me.id, team])
    : q("delete from team_follows where user_id = $1 and team_id = $2", [me.id, team]));
  if (on) await track("team_followed", { userId: me.id, props: { event: ev } });
  revalidatePath(`/e/${ev}`);
}

/** Called from the scoreboard on every tap. Returns an error message instead of redirecting. */
export async function saveScore(game: string, ev: string, home: number, away: number, status: "live" | "final" | "scheduled"): Promise<{ error?: string }> {
  const me = await requireMe();
  if (!isId(game) || !isId(ev)) return { error: "Bad game" };
  let before: string | null = null;
  try {
    before = await asUser(me.id, async (q) => {
      const [g] = await q<{ status: string }>("select status from games where id = $1", [game]);
      await q("select set_score($1, $2, $3, $4)", [game, home | 0, away | 0, status]);
      return g?.status ?? null;
    });
  } catch (e) { return { error: dbMessage(e) }; }
  if (status === "final") await track("game_final", { userId: me.id, props: { event: ev } });
  after(() => notifyGame(game, before));
  revalidatePath(`/day/${ev}`);
  revalidatePath(`/e/${ev}`);
  return {};
}
