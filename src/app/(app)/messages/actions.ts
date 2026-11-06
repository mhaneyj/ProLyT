"use server";
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { alertThread } from "@/lib/messages";

export type SendState = { error?: string; sent?: number };
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function sendMessage(_: SendState, form: FormData): Promise<SendState> {
  const me = await requireMe();
  const thread = String(form.get("thread") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!isId(thread)) return { error: "Unknown conversation" };
  if (!body) return { error: "Write a message first" };
  try {
    await asUser(me.id, (q) => q("select send_message($1, $2)", [thread, body]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  const h = await headers();
  const current = { proto: (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim(), host: h.get("host") ?? "" };
  after(() => alertThread(thread, me.id, current).catch((e) => console.error("[messages] alert failed", e)));
  revalidatePath(`/messages/${thread}`);
  return { sent: Date.now() };
}

export async function deleteMessage(form: FormData) {
  const me = await requireMe();
  const thread = String(form.get("thread")), id = String(form.get("id"));
  if (!isId(thread) || !isId(id)) return;
  await asUser(me.id, (q) => q("select delete_message($1)", [id])).catch(() => undefined);
  revalidatePath(`/messages/${thread}`);
}

export async function reportMessage(form: FormData) {
  const me = await requireMe();
  const thread = String(form.get("thread")), id = String(form.get("id"));
  const reason = String(form.get("reason") ?? "").trim() || "Reported from the app";
  if (!isId(thread) || !isId(id)) return;
  await asUser(me.id, (q) => q("select report_message($1, $2)", [id, reason]));
  redirect(`/messages/${thread}?reported=1`);
}

export async function setBlock(form: FormData) {
  const me = await requireMe();
  const thread = String(form.get("thread")), athlete = String(form.get("athlete")), user = String(form.get("user"));
  if (![thread, athlete, user].every(isId)) return;
  await asUser(me.id, (q) => q("select set_block($1, $2, $3)", [athlete, user, form.get("on") === "1"]));
  revalidatePath(`/messages/${thread}`);
}

export async function setMuted(form: FormData) {
  const me = await requireMe();
  const thread = String(form.get("thread"));
  if (!isId(thread)) return;
  await asUser(me.id, (q) => q(`insert into thread_reads (thread_id, user_id, muted) values ($1, auth.uid(), $2)
    on conflict (thread_id, user_id) do update set muted = excluded.muted`, [thread, form.get("on") === "1"]));
  revalidatePath(`/messages/${thread}`);
}

export async function startThread(form: FormData) {
  const me = await requireMe();
  const kind = String(form.get("kind"));
  const target = String(form.get("target") ?? "");
  if (!me.orgId || !["announcements", "team", "athlete"].includes(kind)) return;
  let id: string;
  try {
    const [r] = await asUser(me.id, (q) => q<{ id: string }>("select open_thread($1, $2, $3, $4) id",
      [me.orgId, kind, kind === "team" && isId(target) ? target : null, kind === "athlete" && isId(target) ? target : null]));
    id = r.id;
  } catch (e) {
    redirect(`/messages/new?error=${encodeURIComponent(dbMessage(e))}`);
  }
  redirect(`/messages/${id}`);
}
