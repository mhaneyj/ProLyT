"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

export type PostState = { error?: string; ok?: number };
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
const back = (form: FormData) => { const b = String(form.get("back") ?? ""); return /^\/[a-z0-9/_?=&-]*$/i.test(b) && !b.startsWith("//") ? b : "/feed"; };

export async function createPost(_: PostState, form: FormData): Promise<PostState> {
  const me = await requireMe();
  const [kind, id] = String(form.get("as") ?? "").split(":");
  if (!isId(id) || !["athlete", "org"].includes(kind)) return { error: "Pick who you're posting as" };
  const clip = form.get("clip");
  const photo = String(form.get("photo") ?? "") || null;
  try {
    await asUser(me.id, (q) => q("select create_post($1, $2, $3, $4, $5)", [
      kind === "athlete" ? id : null, kind === "org" ? id : null, String(form.get("body") ?? ""), isId(clip) ? clip : null, photo]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath("/feed");
  return { ok: Date.now() };
}

export async function toggleProps(form: FormData) {
  const me = await requireMe();
  const id = form.get("post");
  if (!isId(id)) return;
  await asUser(me.id, (q) => q("select toggle_props($1)", [id])).catch(() => undefined);
  revalidatePath(back(form).split("?")[0]);
}

export async function deletePost(form: FormData) {
  const me = await requireMe();
  const id = form.get("post");
  if (!isId(id)) return;
  await asUser(me.id, (q) => q("select delete_post($1)", [id]));
  const b = back(form);
  redirect(b.startsWith("/post/") ? "/feed" : b);
}

export async function reportPost(form: FormData) {
  const me = await requireMe();
  const post = form.get("post"), comment = form.get("comment");
  await asUser(me.id, (q) => q("select report_post($1, $2, $3)", [isId(post) ? post : null, isId(comment) ? comment : null, String(form.get("reason") ?? "").trim() || "Reported from the app"]));
  const b = back(form);
  redirect(`${b}${b.includes("?") ? "&" : "?"}reported=1`);
}

export async function addComment(form: FormData) {
  const me = await requireMe();
  const post = form.get("post");
  if (!isId(post)) return;
  try {
    await asUser(me.id, (q) => q("select add_comment($1, $2)", [post, String(form.get("body") ?? "")]));
  } catch (e) {
    redirect(`/post/${post}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  redirect(`/post/${post}#comments`);
}

export async function deleteComment(form: FormData) {
  const me = await requireMe();
  const id = form.get("comment"), post = form.get("post");
  if (!isId(id) || !isId(post)) return;
  await asUser(me.id, (q) => q("select delete_comment($1)", [id]));
  revalidatePath(`/post/${post}`);
}

export async function setFollow(form: FormData) {
  const me = await requireMe();
  const athlete = form.get("athlete"), org = form.get("org");
  await asUser(me.id, (q) => q("select set_follow($1, $2, $3)", [isId(athlete) ? athlete : null, isId(org) ? org : null, form.get("on") === "1"]));
  revalidatePath(back(form).split("?")[0]);
}

export async function setInNetwork(form: FormData) {
  const me = await requireMe();
  const athlete = form.get("athlete");
  if (!isId(athlete)) return;
  await asUser(me.id, (q) => q("select set_in_network($1, $2)", [athlete, form.get("on") === "1"]));
  revalidatePath(back(form).split("?")[0]);
}
