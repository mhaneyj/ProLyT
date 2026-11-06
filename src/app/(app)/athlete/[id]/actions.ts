"use server";
import { redirect } from "next/navigation";
import { sendAthleteLink } from "@/lib/athlete-links";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { cleanLink, parseClock, teamUploadPrefix, uploadPrefix } from "@/lib/film";

export type FilmState = { ok?: string; error?: string };

const schema = z.object({
  athlete: z.guid().optional(),
  team: z.literal("1").optional(),
  title: z.string().trim().min(2, "Give the clip a title").max(80),
  kind: z.enum(["training", "game"]),
  link: z.string().optional(),
  pathname: z.string().optional(),
  highlight: z.string().optional(),
});

export async function addFilm(_: FilmState, form: FormData): Promise<FilmState> {
  const me = await requireMe();
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  if (d.team) return addTeamFilm(me, d);
  if (!d.athlete) return { error: "Pick an athlete" };
  const athlete = d.athlete;
  let storage: string | null = null;
  if (d.pathname) {
    if (!d.pathname.startsWith(uploadPrefix(athlete)) || d.pathname.includes("..")) return { error: "Upload didn't match this athlete. Try again." };
    storage = `blob:${d.pathname}`;
  } else {
    storage = cleanLink(d.link ?? "");
    if (!storage) return { error: "Paste a full https:// link (YouTube, Hudl, Vimeo…)" };
  }
  try {
    await asUser(me.id, async (q) => {
      // File it under the program viewing it if the athlete is connected there, else their first program.
      const [org] = await q<{ org_id: string }>(`
        select pa.org_id from program_athletes pa where pa.athlete_id = $1 and pa.status = 'active'
        order by (pa.org_id = $2) desc nulls last, pa.joined_at limit 1`, [athlete, me.orgId]);
      if (!org) throw new Error("Connect this athlete to a program first");
      await q(
        `insert into film (org_id, athlete_id, storage_path, title, kind, is_highlight, uploaded_by)
         values ($1, $2, $3, $4, $5::film_kind, $6, $7)`,
        [org.org_id, athlete, storage, d.title, d.kind, d.highlight === "on", me.id]);
    });
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/film`);
  return { ok: "Film added." };
}

async function addTeamFilm(me: Awaited<ReturnType<typeof requireMe>>, d: z.infer<typeof schema>): Promise<FilmState> {
  if (!me.orgId) return { error: "Open your program first" };
  let storage: string | null;
  if (d.pathname) {
    if (!d.pathname.startsWith(teamUploadPrefix(me.orgId)) || d.pathname.includes("..")) return { error: "Upload didn't match this program. Try again." };
    storage = `blob:${d.pathname}`;
  } else {
    storage = cleanLink(d.link ?? "");
    if (!storage) return { error: "Paste a full https:// link (YouTube, Hudl, Vimeo…)" };
  }
  try {
    await asUser(me.id, (q) => q(`insert into film (org_id, athlete_id, storage_path, title, kind, uploaded_by) values ($1, null, $2, $3, $4::film_kind, $5)`,
      [me.orgId, storage, d.title, d.kind, me.id]));
  } catch (e) {
    return { error: /row-level security/.test(dbMessage(e)) ? "You need film permission to add team film." : dbMessage(e) };
  }
  revalidatePath("/coach/film");
  return { ok: "Team film added. Now mark clips for your athletes." };
}

const clipSchema = z.object({
  film: z.guid(), athlete: z.guid(), back: z.string().startsWith("/").max(200),
  start: z.string(), end: z.string(), title: z.string().trim().min(2, "Give the clip a title").max(80),
  highlight: z.string().optional(),
});

/** Marks a moment in film and tags the athlete in it. */
export async function addClip(form: FormData) {
  const me = await requireMe();
  const p = clipSchema.safeParse(Object.fromEntries(form));
  const back = typeof form.get("back") === "string" && String(form.get("back")).startsWith("/") ? String(form.get("back")) : "/";
  const fail = (m: string) => redirect(`${back}${back.includes("?") ? "&" : "?"}clip_error=${encodeURIComponent(m)}`);
  if (!p.success) return fail(p.error.issues[0].message);
  const start = parseClock(p.data.start), end = parseClock(p.data.end);
  if (start == null || end == null) return fail("Times look like 1:05");
  if (end <= start) return fail("The end has to be after the start");
  if (end - start > 300) return fail("Keep clips under 5 minutes");
  try {
    await asUser(me.id, (q) => q(`insert into clips (film_id, athlete_id, start_s, end_s, title, is_highlight, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
      [p.data.film, p.data.athlete, start, end, p.data.title, p.data.highlight === "on", me.id]));
  } catch (e) {
    return fail(/row-level security/.test(dbMessage(e)) ? "You can't tag that athlete in this film." : dbMessage(e));
  }
  revalidatePath(`/athlete/${p.data.athlete}/film`);
  revalidatePath(`/athlete/${p.data.athlete}`);
  redirect(back);
}

export async function clipAction(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("clip")), athlete = String(form.get("athlete"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await asUser(me.id, (q) => form.get("do") === "delete"
    ? q("delete from clips where id = $1", [id])
    : q("update clips set is_highlight = not is_highlight where id = $1", [id]));
  revalidatePath(`/athlete/${athlete}/film`);
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath("/coach/film");
}

export async function toggleHighlight(form: FormData) {
  const me = await requireMe();
  const film = String(form.get("film")), athlete = String(form.get("athlete"));
  await asUser(me.id, (q) => q("update film set is_highlight = not is_highlight where id = $1", [film]));
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/film`);
}

export async function deleteFilm(form: FormData) {
  const me = await requireMe();
  const film = String(form.get("film")), athlete = String(form.get("athlete"));
  const [row] = await asUser(me.id, (q) => q<{ storage_path: string }>("delete from film where id = $1 returning storage_path", [film]));
  if (row?.storage_path.startsWith("blob:") && process.env.BLOB_READ_WRITE_TOKEN) {
    const { del } = await import("@vercel/blob");
    await del(row.storage_path.slice(5)).catch(() => undefined);
  }
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/film`);
}

export async function setPhoto(athlete: string, pathname: string | null) {
  const me = await requireMe();
  if (!z.guid().safeParse(athlete).success) return { error: "Unknown athlete" };
  if (pathname && (!pathname.startsWith(`photos/${athlete}/`) || pathname.includes(".."))) return { error: "Upload didn't match this athlete" };
  const rows = await asUser(me.id, (q) =>
    q("update athletes set photo_path = $2 where id = $1 and is_family(id) returning id", [athlete, pathname ? `blob:${pathname}` : null]));
  if (!rows.length) return { error: "Only the athlete or a parent can change the photo" };
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath("/family");
  return { ok: true };
}

export async function addNote(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const focus = String(form.get("focus") ?? "").trim() || null;
  const session = String(form.get("session") ?? "") || null;
  if (!z.guid().safeParse(athlete).success || body.length < 2) return;
  await asUser(me.id, (q) => q(`
    insert into coach_notes (athlete_id, org_id, coach_id, session_id, body, focus)
    select $1, pa.org_id, $2, $3, $4, $5 from program_athletes pa
    where pa.athlete_id = $1 and pa.status = 'active' and is_staff(pa.org_id)
    order by (pa.org_id = $6) desc nulls last limit 1`, [athlete, me.id, session, body.slice(0, 1000), focus?.slice(0, 200) ?? null, me.orgId]));
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/progress`);
  if (session) revalidatePath(`/coach/session/${session}`);
}

export async function shareProfile(form: FormData) {
  const me = await requireMe();
  if (!me.features.recruiting) return;
  const athlete = String(form.get("athlete") ?? "");
  const { newShareToken, shareHash } = await import("@/lib/share");
  const token = newShareToken();
  try {
    await asUser(me.id, (q) => q("select create_profile_share($1, $2)", [athlete, shareHash(token)]));
  } catch (e) {
    const { redirect } = await import("next/navigation");
    redirect(`/athlete/${athlete}?share_error=${encodeURIComponent(dbMessage(e))}`);
  }
  const { redirect } = await import("next/navigation");
  // The token is shown once, right after it's made; only its hash is stored.
  redirect(`/athlete/${athlete}?shared=${token}#recruiting`);
}

export async function stopSharing(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  await asUser(me.id, (q) => q("select revoke_profile_share($1)", [athlete]));
  revalidatePath(`/athlete/${athlete}`);
}

// ───────────── Profile v2: edit, timeline, logins ─────────────

const profileSchema = z.object({
  position: z.string().trim().max(40).optional(),
  grad_year: z.union([z.literal(""), z.coerce.number().int().min(2024).max(2045)]).optional(),
  sport: z.string().trim().min(2).max(40),
  hometown: z.string().trim().max(80).optional(),
  school: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(400, "Keep your bio under 400 characters").optional(),
  highlight_url: z.union([z.url({ protocol: /^https$/, error: "Highlight link must start with https://" }), z.literal("")]).optional(),
  gpa: z.union([z.literal(""), z.coerce.number().min(0).max(5, "GPA should be 0 to 5")]).optional(),
  intended_major: z.string().trim().max(80).optional(),
  theme_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  height: z.union([z.literal(""), z.coerce.number().min(48, "Height should be 48 to 90 inches").max(90, "Height should be 48 to 90 inches")]).optional(),
  weight: z.union([z.literal(""), z.coerce.number().min(60, "Weight should be 60 to 400 lb").max(400, "Weight should be 60 to 400 lb")]).optional(),
  wingspan: z.union([z.literal(""), z.coerce.number().min(48, "Wingspan should be 48 to 96 inches").max(96, "Wingspan should be 48 to 96 inches")]).optional(),
});

export type ProfileState = { error?: string };

/** The athlete or a parent adds a number (self-reported, with an optional proof link). */
export async function addStat(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  const metric = String(form.get("metric") ?? "");
  const raw = String(form.get("value") ?? "").trim().replace(/[^\d.]/g, "");
  const proof = String(form.get("proof") ?? "").trim();
  const date = String(form.get("date") ?? "");
  let msg = "stat=added";
  try {
    if (!z.guid().safeParse(athlete).success) throw new Error("Unknown athlete");
    const { METRICS } = await import("@/lib/domain/metrics");
    const m = METRICS[metric];
    if (!m) throw new Error("Pick a test");
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) throw new Error("Enter the result as a number, like 4.65");
    if (proof && !/^https:\/\/[^\s]+\.[^\s]+/.test(proof)) throw new Error("Proof link must start with https://");
    const when = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date) <= new Date() ? `${date}T12:00:00-08:00` : null;
    await asUser(me.id, (q) => q(`insert into results (athlete_id, metric, value, unit, source, proof_url, recorded_at)
      values ($1, $2, $3, $4, 'self_reported', $5, coalesce($6::timestamptz, now()))`, [athlete, metric, value, m.unit, proof || null, when]));
  } catch (e) {
    msg = `stat_error=${encodeURIComponent(dbMessage(e))}`;
  }
  revalidatePath(`/athlete/${athlete}`);
  redirect(`/athlete/${athlete}?${msg}`);
}

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  const p = profileSchema.safeParse(Object.fromEntries(form));
  if (!p.success || !z.guid().safeParse(athlete).success) return { error: p.success ? "Unknown athlete" : p.error.issues[0].message };
  const d = p.data;
  const empty = (x: unknown) => (x === "" || x === undefined ? null : x);
  const { SHOWCASE_ORDER } = await import("@/lib/domain/metrics");
  const picked = form.getAll("featured").map(String).filter((k) => SHOWCASE_ORDER.includes(k));
  if (picked.length > 4) return { error: "Pick up to 4 featured stats" };
  const featured = picked.length ? picked : null;
  try {
    await asUser(me.id, async (q) => {
      const rows = await q(`update athletes set position = $2, grad_year = $3, sport = $4, hometown = $5, school = $6, bio = $7,
          highlight_url = $8, gpa = $9, intended_major = $10, show_academics = $11, theme_color = $12, featured_metrics = $13
        where id = $1 and is_family(id) returning id`,
        [athlete, empty(d.position), empty(d.grad_year), d.sport.toLowerCase(), empty(d.hometown), empty(d.school), empty(d.bio),
          empty(d.highlight_url), empty(d.gpa), empty(d.intended_major), form.get("show_academics") === "on", d.theme_color ?? null, featured]);
      if (!rows.length) throw new Error("Only the athlete or a parent can edit this profile");
      // Height and weight typed here are self-reported; a coach's measurement outranks them.
      for (const [metric, v] of [["height_in", d.height], ["weight_lb", d.weight], ["wingspan_in", d.wingspan]] as const) {
        if (v === "" || v === undefined) continue;
        const [last] = await q<{ value: number }>(
          "select value::float value from results where athlete_id = $1 and metric = $2 and source = 'self_reported' order by recorded_at desc limit 1", [athlete, metric]);
        if (!last || Number(last.value) !== Number(v)) {
          await q("insert into results (athlete_id, metric, value, unit, source) values ($1, $2, $3, $4, 'self_reported')", [athlete, metric, v, metric === "weight_lb" ? "lb" : "in"]);
        }
      }
    });
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath(`/athlete/${athlete}`);
  redirect(`/athlete/${athlete}?saved=1`);
}

const stintSchema = z.object({
  athlete: z.guid(),
  org_name: z.string().trim().min(2, "Enter the school or team").max(80),
  team_name: z.string().trim().max(80).optional(),
  level: z.enum(["youth", "middle_school", "freshman", "jv", "varsity", "club", "college", "adult"]).optional(),
  position: z.string().trim().max(40).optional(),
  started: z.string().regex(/^\d{4}-\d{2}$/, "Pick when it started"),
  ended: z.union([z.string().regex(/^\d{4}-\d{2}$/), z.literal("")]).optional(),
});

export async function addStint(form: FormData) {
  const me = await requireMe();
  const p = stintSchema.safeParse(Object.fromEntries(form));
  const athlete = String(form.get("athlete") ?? "");
  if (!p.success) redirect(`/athlete/${athlete}?timeline_error=${encodeURIComponent(p.error.issues[0].message)}#timeline`);
  const d = p.data;
  try {
    await asUser(me.id, (q) => q(`insert into stints (athlete_id, org_name, team_name, level, position, started_on, ended_on, source, created_by)
      values ($1, $2, $3, $4, $5, ($6 || '-01')::date, case when $7 = '' then null else ($7 || '-01')::date end, 'athlete', $8)`,
      [d.athlete, d.org_name, d.team_name || null, d.level ?? null, d.position || null, d.started, d.ended ?? "", me.id]));
  } catch (e) {
    redirect(`/athlete/${athlete}?timeline_error=${encodeURIComponent(dbMessage(e))}#timeline`);
  }
  revalidatePath(`/athlete/${athlete}`);
  redirect(`/athlete/${athlete}#timeline`);
}

export async function removeStint(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  await asUser(me.id, (q) => q("delete from stints where id = $1 and source = 'athlete'", [String(form.get("stint"))]));
  revalidatePath(`/athlete/${athlete}`);
}

/** Program staff confirm team, position and jersey on their own stint. */
export async function updateOrgStint(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  try {
    await asUser(me.id, (q) => q("update stints set team_id = $2, position = $3, jersey = $4 where id = $1 and source = 'org'",
      [String(form.get("stint")), String(form.get("team") ?? "") || null, String(form.get("position") ?? "").trim() || null, String(form.get("jersey") ?? "").trim().slice(0, 4) || null]));
  } catch (e) {
    redirect(`/athlete/${athlete}?timeline_error=${encodeURIComponent(dbMessage(e))}#timeline`);
  }
  revalidatePath(`/athlete/${athlete}`);
}

export async function inviteParent(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? ""), email = String(form.get("email") ?? "");
  let msg = "parent=sent";
  try {
    const [a] = await asUser(me.id, (q) => q<{ id: string; first_name: string; last_name: string }>("select id, first_name, last_name from athletes where id = $1", [athlete]));
    if (!a) throw new Error("Unknown athlete");
    if (me.email && email.trim().toLowerCase() === me.email.toLowerCase()) throw new Error("Use your parent's email, not yours");
    await sendAthleteLink(me.id, `${a.first_name} ${a.last_name}`, a, "parent", email);
  } catch (e) {
    msg = `parent_error=${encodeURIComponent(dbMessage(e))}`;
  }
  redirect(`/athlete/${athlete}?${msg}`);
}

/** A parent makes their teen's login with an email and password (or resets the teen's password). */
export async function setTeenPassword(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? ""), email = String(form.get("email") ?? ""), pw = String(form.get("password") ?? "");
  let msg = "login=pw";
  try {
    const [a] = await asUser(me.id, (q) => q<{ ok: boolean; teen: boolean; user_id: string | null; first_name: string }>(
      "select is_guardian(id) ok, age_on(birth_date) between 13 and 17 teen, user_id, first_name from athletes where id = $1", [athlete]));
    if (!a?.ok) throw new Error("Only a parent can do this");
    if (!a.teen) throw new Error("Parents set passwords for athletes 13 to 17");
    const { asService } = await import("@/lib/db");
    const { createLoginWithPassword, setPassword } = await import("@/lib/session");
    await asService(async (q) => {
      if (a.user_id) return setPassword(q, a.user_id, pw);
      if (me.email && email.trim().toLowerCase() === me.email.toLowerCase()) throw new Error(`Use ${a.first_name}'s own email, not yours`);
      const uid = await createLoginWithPassword(q, email, pw);
      await q("update athletes set user_id = $2, parent_approved_at = coalesce(parent_approved_at, now()) where id = $1 and user_id is null", [athlete, uid]);
      await q(`insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
               select $1, null, $2, 'parental_verification', 'parent-made-login-2026-11', coalesce(nullif(full_name, ''), email) from profiles where id = $2`, [athlete, me.id]);
      await q("insert into audit_log (actor, action, target) values ($1, 'parent_made_login', $2)", [me.id, athlete]);
    });
    if (a.user_id) msg = "login=reset";
  } catch (e) {
    msg = `login_error=${encodeURIComponent(dbMessage(e))}`;
  }
  redirect(`/athlete/${athlete}?${msg}#family`);
}

export async function giveLogin(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? ""), email = String(form.get("email") ?? "");
  let msg = "login=sent";
  try {
    const [a] = await asUser(me.id, (q) => q<{ id: string; first_name: string }>("select id, first_name from athletes where id = $1", [athlete]));
    if (!a) throw new Error("Unknown athlete");
    if (me.email && email.trim().toLowerCase() === me.email.toLowerCase()) throw new Error(`Use ${a.first_name}'s own email, not yours`);
    await sendAthleteLink(me.id, me.name, a, "athlete", email);
  } catch (e) {
    msg = `login_error=${encodeURIComponent(dbMessage(e))}`;
  }
  redirect(`/athlete/${athlete}?${msg}#family`);
}
