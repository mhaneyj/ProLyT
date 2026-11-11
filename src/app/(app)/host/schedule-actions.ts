"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage, type Q } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { assignSlots, bracket, pools, poolName, roundRobin } from "@/lib/domain/schedule";
import { zonedToUtc } from "@/lib/domain/time";
import { track } from "@/lib/track";

const page = (ev: string) => `/host/events/${ev}/schedule`;
const fail = (ev: string, e: unknown) => redirect(`${page(ev)}?error=${encodeURIComponent(typeof e === "string" ? e : dbMessage(e))}`);

type Ctx = { first: Date; minutes: number; fields: { id: string; name: string }[]; existing: { id: string; field_id: string | null; starts_at: string | null; home_team: string | null; away_team: string | null; division_id: string; stage: string }[] };

async function context(q: Q, ev: string): Promise<Ctx> {
  const [e] = await q<{ first_game_at: string | null; game_minutes: number; host: boolean }>("select first_game_at, game_minutes, is_event_host(id) host from events where id = $1", [ev]);
  if (!e?.host) throw "Only the host can build the schedule";
  if (!e.first_game_at) throw "Set the first game time first";
  const fields = await q<{ id: string; name: string }>("select id, name from event_fields where event_id = $1 order by sort, name", [ev]);
  if (!fields.length) throw "Add at least one field";
  const existing = await q<Ctx["existing"][number]>("select id, field_id, starts_at, home_team, away_team, division_id, stage from games where event_id = $1", [ev]);
  return { first: new Date(e.first_game_at), minutes: e.game_minutes, fields, existing };
}

/** Field and team occupancy (by slot number) from games already on the schedule, except the ones being replaced. */
function busy(c: Ctx, skip: (g: Ctx["existing"][number]) => boolean) {
  const busyField = new Map<string, Set<number>>(), busyTeam = new Map<string, Set<number>>();
  const add = (m: Map<string, Set<number>>, k: string, s: number) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(s); };
  for (const g of c.existing) {
    if (skip(g) || !g.starts_at) continue;
    const s = Math.round((new Date(g.starts_at).getTime() - c.first.getTime()) / (c.minutes * 60000));
    if (g.field_id) add(busyField, g.field_id, s);
    for (const t of [g.home_team, g.away_team]) if (t) add(busyTeam, t, s);
  }
  return { busyField, busyTeam };
}
const at = (c: Ctx, slot: number) => new Date(c.first.getTime() + slot * c.minutes * 60000).toISOString();

export async function saveScheduleSettings(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event");
  if (!isId(ev)) return;
  try {
    const first = zonedToUtc(String(form.get("first") ?? ""));
    const minutes = Number(form.get("minutes"));
    if (!(minutes >= 10 && minutes <= 120)) throw "Game slots are 10 to 120 minutes";
    await asUser(me.id, (q) => q("update events set first_game_at = $2, game_minutes = $3 where id = $1 and is_event_host(id)", [ev, first.toISOString(), minutes]));
  } catch (e) { fail(ev, e instanceof Error ? e.message : e); }
  revalidatePath(page(ev));
  redirect(`${page(ev)}?saved=1`);
}

export async function addField(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event");
  if (!isId(ev)) return;
  const names = String(form.get("name") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  try {
    await asUser(me.id, async (q) => {
      const [{ n }] = await q<{ n: number }>("select count(*)::int n from event_fields where event_id = $1", [ev]);
      for (const [i, name] of names.entries()) await q("insert into event_fields (event_id, name, sort) values ($1, $2, $3) on conflict do nothing", [ev, name.slice(0, 40), n + i]);
    });
  } catch (e) { fail(ev, e); }
  revalidatePath(page(ev));
  redirect(page(ev));
}

export async function deleteField(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event"), id = form.get("id");
  if (!isId(ev) || !isId(id)) return;
  await asUser(me.id, (q) => q("delete from event_fields where id = $1 and event_id = $2", [id, ev]));
  revalidatePath(page(ev));
  redirect(page(ev));
}

/** Pool play: round robin in pools of about `size`, spread over the fields. Replaces pool games that haven't started. */
export async function buildPools(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event"), div = form.get("division");
  if (!isId(ev) || !isId(div)) return;
  const size = Math.max(3, Math.min(8, Number(form.get("size")) || 4));
  let n = 0;
  try {
    await asUser(me.id, async (q) => {
      const c = await context(q, ev);
      const started = c.existing.filter((g) => g.division_id === div && g.stage === "pool");
      const [{ played }] = await q<{ played: number }>("select count(*)::int played from games where division_id = $1 and stage = 'pool' and status <> 'scheduled'", [div]);
      if (played) throw "Pool games already started. Edit single games instead.";
      const teams = (await q<{ id: string }>("select id from event_teams where division_id = $1 and status <> 'withdrawn' order by created_at", [div])).map((t) => t.id);
      if (teams.length < 2) throw "This division needs at least 2 teams";
      const ps = pools(teams, size);
      // Interleave rounds across pools so every pool plays early.
      const rr = ps.map((p) => roundRobin(p));
      const games: { home: string; away: string; pool: string; round: number }[] = [];
      for (let r = 0; r < Math.max(...rr.map((x) => x.length)); r++) rr.forEach((rounds, pi) => (rounds[r] ?? []).forEach((g) => games.push({ ...g, pool: poolName(pi), round: r + 1 })));
      const { busyField, busyTeam } = busy(c, (g) => started.some((s) => s.id === g.id));
      const slots = assignSlots(games, c.fields.map((f) => f.id), { busyField, busyTeam, rest: true });
      await q("delete from games where division_id = $1 and stage = 'pool' and status = 'scheduled'", [div]);
      for (const s of slots) {
        await q("insert into games (event_id, division_id, stage, pool, round, field_id, starts_at, home_team, away_team) values ($1,$2,'pool',$3,$4,$5,$6,$7,$8)",
          [ev, div, ps.length > 1 ? s.game.pool : null, s.game.round, s.field, at(c, s.slot), s.game.home, s.game.away]);
      }
      n = slots.length;
    });
  } catch (e) { fail(ev, e); }
  await track("schedule_built", { userId: me.id, props: { event: ev, games: n, kind: "pool" } });
  revalidatePath(page(ev));
  redirect(`${page(ev)}?built=${n}#d-${div}`);
}

/** Bracket from current standings (or sign-up order before any games). Replaces a bracket that hasn't started. */
export async function buildBracket(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event"), div = form.get("division");
  if (!isId(ev) || !isId(div)) return;
  const take = Number(form.get("take")) || 0;
  let n = 0;
  try {
    await asUser(me.id, async (q) => {
      const c = await context(q, ev);
      const [{ played }] = await q<{ played: number }>("select count(*)::int played from games where division_id = $1 and stage = 'bracket' and status <> 'scheduled'", [div]);
      if (played) throw "The bracket already started";
      let seeds = (await q<{ team_id: string }>("select team_id from division_standings($1)", [div])).map((r) => r.team_id);
      const anyPool = c.existing.some((g) => g.division_id === div && g.stage === "pool");
      if (!anyPool) seeds = (await q<{ id: string }>("select id from event_teams where division_id = $1 and status <> 'withdrawn' order by created_at", [div])).map((t) => t.id);
      if (take) seeds = seeds.slice(0, take);
      const games = bracket(seeds);
      if (!games.length) throw "A bracket needs at least 2 teams";
      // Start after this division's pool games end; each round after the one before.
      const { busyField, busyTeam } = busy(c, (g) => g.division_id === div && g.stage === "bracket");
      const poolEnd = Math.max(-1, ...c.existing.filter((g) => g.division_id === div && g.stage === "pool" && g.starts_at)
        .map((g) => Math.round((new Date(g.starts_at!).getTime() - c.first.getTime()) / (c.minutes * 60000))));
      const slots = assignSlots(games, c.fields.map((f) => f.id), {
        busyField, busyTeam,
        after: (g, placed) => Math.max(poolEnd + 1, ...[...placed].filter(([x]) => x.round === g.round - 1).map(([, s]) => s + 1)),
      });
      await q("delete from games where division_id = $1 and stage = 'bracket'", [div]);
      const ids = new Map(games.map((g) => [g.key, randomUUID()]));
      for (const s of [...slots].sort((a, b) => b.game.round - a.game.round)) {
        const g = s.game;
        await q(`insert into games (id, event_id, division_id, stage, round, label, field_id, starts_at, home_team, away_team, next_game, next_slot)
          values ($1,$2,$3,'bracket',$4,$5,$6,$7,$8,$9,$10,$11)`,
          [ids.get(g.key), ev, div, g.round, g.label, s.field, at(c, s.slot), g.home, g.away, g.next ? ids.get(g.next) : null, g.slot]);
      }
      n = slots.length;
    });
  } catch (e) { fail(ev, e); }
  await track("schedule_built", { userId: me.id, props: { event: ev, games: n, kind: "bracket" } });
  revalidatePath(page(ev));
  redirect(`${page(ev)}?built=${n}#d-${div}`);
}

export async function editGame(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event"), id = form.get("id"), field = form.get("field");
  if (!isId(ev) || !isId(id)) return;
  try {
    const when = zonedToUtc(String(form.get("starts") ?? "")).toISOString();
    await asUser(me.id, (q) => q("update games set starts_at = $3, field_id = $4 where id = $1 and event_id = $2", [id, ev, when, isId(field) ? field : null]));
  } catch (e) { fail(ev, e instanceof Error ? e.message : e); }
  revalidatePath(page(ev));
  redirect(`${page(ev)}?saved=1`);
}

export async function staffLink(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event");
  if (!isId(ev)) return;
  const { randomBytes } = await import("node:crypto");
  await asUser(me.id, (q) => q("select staff_link($1, $2)", [ev, randomBytes(24).toString("base64url")]));
  revalidatePath(`/host/events/${ev}`);
  redirect(`/host/events/${ev}#staff`);
}

export async function removeStaff(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event"), user = form.get("user");
  if (!isId(ev) || !isId(user)) return;
  await asUser(me.id, (q) => q("select remove_staff($1, $2)", [ev, user]));
  revalidatePath(`/host/events/${ev}`);
  redirect(`/host/events/${ev}#staff`);
}
