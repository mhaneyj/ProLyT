"use server";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { PRESETS, type Division } from "@/lib/domain/events";
import { track } from "@/lib/track";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
const back = (path: string, key: string, msg: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
const newJoinToken = async () => randomBytes(32).toString("hex");

const eventSchema = z.object({
  name: z.string().trim().min(3, "Give the event a name").max(120),
  kind: z.enum(["tournament", "combine", "camp"]),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  location: z.string().trim().max(200),
  closes: z.string().or(z.literal("")),
  waiver: z.string().trim().max(20000),
  preset: z.string(),
});

export async function createEvent(form: FormData) {
  const me = await requireMe();
  if (!me.orgId) redirect("/host");
  const p = eventSchema.safeParse(Object.fromEntries(form));
  if (!p.success) back("/host/new", "error", p.error.issues[0].message);
  const d = p.data!;
  let id: string;
  try {
    id = await asUser(me.id, async (q) => {
      const [e] = await q<{ id: string }>(`insert into events (org_id, name, kind, starts_on, ends_on, location, registration_closes_at, waiver_text, created_by)
        values ($1, $2, $3, $4, nullif($5, '')::date, nullif($6, ''), nullif($7, '')::timestamptz, nullif($8, ''), $9) returning id`,
        [me.orgId, d.name, d.kind, d.starts_on, d.ends_on, d.location, d.closes ? `${d.closes}T23:59:00-08:00` : "", d.waiver, me.id]);
      for (const div of (PRESETS[d.preset] ?? PRESETS.none).build(d.starts_on)) await insertDivision(q, e.id, div);
      return e.id;
    });
  } catch (e) {
    back("/host/new", "error", /row-level security/.test(dbMessage(e)) ? "Only program owners and coaches can host events." : dbMessage(e));
  }
  await track("event_created", { userId: me.id, orgId: me.orgId, props: { event: id!, preset: d.preset } });
  redirect(`/host/events/${id!}?created=1`);
}

async function insertDivision(q: Parameters<Parameters<typeof asUser>[1]>[0], eventId: string, d: Division) {
  await q(`insert into divisions (event_id, name, basis, max_age, min_age, age_cutoff, max_grade, min_grade, no_seniors, gender, roster_max, team_cap, sort)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [eventId, d.name, d.basis, d.max_age, d.min_age ?? null, d.age_cutoff, d.max_grade, d.min_grade ?? null, d.no_seniors, d.gender, d.roster_max, d.team_cap ?? null, d.sort ?? 0]);
}

const divSchema = z.object({
  event: z.guid(), id: z.guid().or(z.literal("")),
  name: z.string().trim().min(1, "Name the division").max(60),
  basis: z.enum(["age", "grade", "either"]),
  max_age: z.union([z.literal(""), z.coerce.number().int().min(5).max(25)]),
  age_cutoff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  max_grade: z.union([z.literal(""), z.coerce.number().int().min(0).max(12)]),
  min_grade: z.union([z.literal(""), z.coerce.number().int().min(0).max(12)]),
  gender: z.enum(["open", "girls", "boys"]),
  roster_max: z.coerce.number().int().min(5, "Rosters need at least 5").max(60, "Rosters up to 60"),
  team_cap: z.union([z.literal(""), z.coerce.number().int().min(2).max(256)]),
});

export async function saveDivision(form: FormData) {
  const me = await requireMe();
  const p = divSchema.safeParse(Object.fromEntries(form));
  const ev = String(form.get("event") ?? "");
  const path = `/host/events/${isId(ev) ? ev : ""}`;
  if (!p.success) back(path, "error", p.error.issues[0].message);
  const d = p.data!;
  const n = (x: number | "") => (x === "" ? null : x);
  if (d.basis !== "grade" && (d.max_age === "" || !d.age_cutoff)) back(path, "error", "Age divisions need a max age and an 'age as of' date");
  if (d.basis !== "age" && d.max_grade === "") back(path, "error", "Grade divisions need a highest grade");
  const div: Division = { name: d.name, basis: d.basis, max_age: d.basis === "grade" ? null : n(d.max_age), age_cutoff: d.basis === "grade" ? null : d.age_cutoff,
    max_grade: d.basis === "age" ? null : n(d.max_grade), min_grade: d.basis === "age" ? null : n(d.min_grade), no_seniors: form.get("no_seniors") === "on",
    gender: d.gender, roster_max: d.roster_max, team_cap: n(d.team_cap) };
  try {
    await asUser(me.id, async (q) => {
      if (d.id) {
        const r = await q(`update divisions set name=$2, basis=$3, max_age=$4, age_cutoff=$5, max_grade=$6, min_grade=$7, no_seniors=$8, gender=$9, roster_max=$10, team_cap=$11
          where id=$1 returning id`, [d.id, div.name, div.basis, div.max_age, div.age_cutoff, div.max_grade, div.min_grade, div.no_seniors, div.gender, div.roster_max, div.team_cap ?? null]);
        if (!r.length) throw new Error("You can't edit this division");
      } else {
        const [{ n: sort }] = await q<{ n: number }>("select coalesce(max(sort), 0) + 1 n from divisions where event_id = $1", [d.event]);
        await insertDivision(q, d.event, { ...div, sort });
      }
    });
  } catch (e) {
    back(path, "error", dbMessage(e));
  }
  revalidatePath(path);
  redirect(`${path}?saved=division`);
}

export async function deleteDivision(form: FormData) {
  const me = await requireMe();
  const id = form.get("id"), ev = form.get("event");
  if (!isId(id) || !isId(ev)) return;
  try {
    await asUser(me.id, async (q) => {
      const [{ n }] = await q<{ n: number }>("select count(*)::int n from event_teams where division_id = $1", [id]);
      if (n) throw new Error("This division has teams. Move or withdraw them first.");
      await q("delete from divisions where id = $1", [id]);
    });
  } catch (e) {
    back(`/host/events/${ev}`, "error", dbMessage(e));
  }
  revalidatePath(`/host/events/${ev}`);
}

export async function setEventStatus(form: FormData) {
  const me = await requireMe();
  const ev = form.get("event"), status = String(form.get("status"));
  if (!isId(ev) || !["draft", "open", "closed", "live", "done", "cancelled"].includes(status)) return;
  await asUser(me.id, (q) => q("update events set status = $2 where id = $1", [ev, status]));
  await track("event_status", { userId: me.id, props: { event: ev, status } });
  revalidatePath(`/host/events/${ev}`);
}

export async function saveEventDetails(form: FormData) {
  const me = await requireMe();
  const ev = String(form.get("event") ?? "");
  if (!isId(ev)) return;
  try {
    await asUser(me.id, (q) => q(`update events set location = nullif($2, ''), details = nullif($3, ''), waiver_text = nullif($4, ''),
      registration_closes_at = nullif($5, '')::timestamptz, require_age_check = $6 where id = $1`,
      [ev, String(form.get("location") ?? "").slice(0, 200), String(form.get("details") ?? "").slice(0, 4000), String(form.get("waiver") ?? "").slice(0, 20000),
        form.get("closes") ? `${form.get("closes")}T23:59:00-08:00` : "", form.get("require_age_check") === "on"]));
  } catch (e) {
    back(`/host/events/${ev}`, "error", dbMessage(e));
  }
  redirect(`/host/events/${ev}?saved=details`);
}

// ───── Teams ─────
export async function registerTeam(form: FormData) {
  const me = await requireMe();
  const ev = String(form.get("event") ?? ""), division = form.get("division");
  // "org:<id>" = a new entry for that program; "team:<id>" = one of the program's own teams; "" = independent.
  const pick = String(form.get("entry") ?? form.get("org") ?? "");
  const org = pick.startsWith("org:") ? pick.slice(4) : isId(pick) ? pick : null;
  const progTeam = pick.startsWith("team:") ? pick.slice(5) : null;
  const name = String(form.get("name") ?? "").trim();
  if (!isId(ev)) redirect("/home");
  if (!isId(division)) back(`/register-team/${ev}`, "error", "Pick a division");
  if (!progTeam && name.length < 2) back(`/register-team/${ev}`, "error", "Name the team");
  let team: string;
  try {
    const [r] = await asUser(me.id, async (q) => q<{ id: string }>("select register_team($1, $2, $3, $4, $5) id", [division, name, isId(org) ? org : null, await newJoinToken(), isId(progTeam) ? progTeam : null]));
    team = r.id;
  } catch (e) {
    back(`/register-team/${ev}`, "error", dbMessage(e));
  }
  await track("team_registered", { userId: me.id, props: { event: ev, team: team! } });
  redirect(`/teams/${team!}?new=1`);
}

export async function newTeamLink(form: FormData) {
  const me = await requireMe();
  const team = form.get("team");
  if (!isId(team)) return;
  await asUser(me.id, async (q) => q("select team_link($1, $2)", [team, await newJoinToken()]));
  redirect(`/teams/${team}?link=new`);
}

export async function removePlayer(form: FormData) {
  const me = await requireMe();
  const team = form.get("team"), athlete = form.get("athlete");
  if (!isId(team) || !isId(athlete)) return;
  await asUser(me.id, (q) => q("delete from event_roster where team_id = $1 and athlete_id = $2", [team, athlete]));
  revalidatePath(`/teams/${team}`);
}

export async function overridePlayer(form: FormData) {
  const me = await requireMe();
  const team = form.get("team"), athlete = form.get("athlete");
  if (!isId(team) || !isId(athlete)) return;
  try {
    await asUser(me.id, (q) => q("select host_override($1, $2, $3)", [team, athlete, String(form.get("reason") ?? "")]));
  } catch (e) {
    back(`/teams/${team}`, "error", dbMessage(e));
  }
  revalidatePath(`/teams/${team}`);
}

export async function joinTeam(form: FormData) {
  const me = await requireMe();
  const token = String(form.get("token") ?? ""), athlete = form.get("athlete");
  if (!/^[0-9a-f]{64}$/.test(token)) redirect("/home");
  if (!isId(athlete)) back(`/join-team/${token}`, "error", "Pick your athlete");
  if (form.get("agree") !== "on") back(`/join-team/${token}`, "error", "Check the box to agree to the waiver");
  try {
    await asUser(me.id, (q) => q("select join_team($1, $2, $3)", [token, athlete, String(form.get("signer") ?? "")]));
  } catch (e) {
    back(`/join-team/${token}`, "error", dbMessage(e));
  }
  await track("team_joined", { userId: me.id, props: { athlete: String(athlete) } });
  redirect(`/join-team/${token}?joined=${athlete}`);
}

export async function addAthleteForTeam(form: FormData) {
  const me = await requireMe();
  const token = String(form.get("token") ?? "");
  if (!/^[0-9a-f]{64}$/.test(token)) redirect("/home");
  const grad = String(form.get("grad") ?? "").trim();
  if (grad && !/^20\d\d$/.test(grad)) back(`/join-team/${token}`, "error", "Graduation year should look like 2031");
  try {
    await asUser(me.id, (q) => q("select add_my_athlete($1, $2, $3, $4, $5, $6, $7)", [
      String(form.get("first") ?? ""), String(form.get("last") ?? ""), String(form.get("birth") ?? "") || null, grad ? Number(grad) : null,
      String(form.get("position") ?? ""), String(form.get("gender") ?? ""), String(form.get("signer") ?? "")]));
  } catch (e) {
    back(`/join-team/${token}`, "error", dbMessage(e));
  }
  await track("athlete_added", { userId: me.id, props: { via: "team_link" } });
  redirect(`/join-team/${token}?added=1`);
}
