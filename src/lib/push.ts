import "server-only";
import webpush from "web-push";
import { asService } from "./db";

export type PushMessage = { title: string; body: string; url: string; tag?: string };

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
export const pushConfigured = Boolean(PUBLIC && PRIVATE);
if (pushConfigured) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@prolyt.app", PUBLIC!, PRIVATE!);

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Send to every device of these people. Never throws: notifications are best-effort.
 * Without keys (local, tests) it prints what it would send.
 */
export async function pushTo(userIds: string[], m: PushMessage) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  try {
    const subs = await asService((q) => q<Sub>("select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id = any($1::uuid[])", [ids]));
    if (!pushConfigured) {
      for (const id of ids) console.log(`[push] ${id} → ${m.title} | ${m.body} | ${m.url}`);
      return subs.length;
    }
    const payload = JSON.stringify(m);
    const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 6, urgency: "high", topic: m.tag?.slice(0, 32).replace(/[^\w-]/g, "") || undefined })));
    const gone: string[] = [], failed: string[] = [], ok: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(subs[i].id);
      else if ([404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)) gone.push(subs[i].id);
      else failed.push(subs[i].id);
    });
    await asService(async (q) => {
      if (gone.length) await q("delete from push_subscriptions where id = any($1::uuid[])", [gone]);
      if (ok.length) await q("update push_subscriptions set last_sent_at = now(), failures = 0 where id = any($1::uuid[])", [ok]);
      if (failed.length) {
        await q("update push_subscriptions set failures = failures + 1 where id = any($1::uuid[])", [failed]);
        await q("delete from push_subscriptions where failures >= 10");
      }
    });
    return ok.length;
  } catch (e) {
    console.error("[push] failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Families and followers of the two teams in a game. */
export async function gameAudience(gameId: string) {
  const rows = await asService((q) => q<{ user_id: string }>(`
    with g as (select home_team, away_team from games where id = $1), t as (select unnest(array[home_team, away_team]) team from g)
    select f.user_id from team_follows f join t on t.team = f.team_id
    union select gu.user_id from event_roster r join t on t.team = r.team_id join guardians gu on gu.athlete_id = r.athlete_id
    union select a.user_id from event_roster r join t on t.team = r.team_id join athletes a on a.id = r.athlete_id where a.user_id is not null`, [gameId]));
  return rows.map((r) => r.user_id);
}

/** Parents of an athlete (and the athlete, if they have their own login). */
export async function familyOf(athleteId: string) {
  const rows = await asService((q) => q<{ user_id: string }>(`
    select user_id from guardians where athlete_id = $1 union select user_id from athletes where id = $1 and user_id is not null`, [athleteId]));
  return rows.map((r) => r.user_id);
}

/** After a score change: "starting" when a game goes live, the final score when it ends, and the champion. */
export async function notifyGame(gameId: string, before: string | null) {
  const [g] = await asService((q) => q<{ status: string; home: string; away: string; hs: number; as: number; field: string | null; division: string; event: string; event_id: string;
    label: string | null; stage: string; next_game: string | null; winner: string | null }>(`
    select g.status, h.name home, a.name away, g.home_score hs, g.away_score "as", f.name field, d.name division, e.name event, e.id event_id,
      g.label, g.stage, g.next_game, w.name winner
    from games g join event_teams h on h.id = g.home_team join event_teams a on a.id = g.away_team join divisions d on d.id = g.division_id
    join events e on e.id = g.event_id left join event_fields f on f.id = g.field_id left join event_teams w on w.id = g.winner where g.id = $1`, [gameId]));
  if (!g || g.status === before) return;
  const url = `/e/${g.event_id}`;
  const who = await gameAudience(gameId);
  if (g.status === "live" && before === "scheduled") {
    await pushTo(who, { title: `${g.home} vs ${g.away} is starting`, body: [g.division, g.label, g.field].filter(Boolean).join(" · "), url, tag: `game-${gameId}` });
  } else if (g.status === "final") {
    const champ = g.stage === "bracket" && !g.next_game && g.winner;
    await pushTo(who, {
      title: champ ? `🏆 ${g.winner} win ${g.division}!` : `Final: ${g.home} ${g.hs}, ${g.away} ${g.as}`,
      body: champ ? `${g.event} champions, ${Math.max(g.hs, g.as)}–${Math.min(g.hs, g.as)}` : [g.division, g.label ?? "Pool play", g.event].join(" · "),
      url, tag: `game-${gameId}`,
    });
  }
}
