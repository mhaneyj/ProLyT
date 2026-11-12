"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { alertStaff } from "@/lib/support";
import { KINDS } from "@/lib/support";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** Open a request. Captures where they were and what they're on, so nobody has to ask. */
export async function openTicket(form: FormData) {
  const me = await requireMe();
  const kind = String(form.get("kind") ?? "");
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const back = (e: string) => redirect(`/help?error=${encodeURIComponent(e)}&kind=${encodeURIComponent(kind)}`);
  if (!KINDS.some((k) => k[0] === kind)) back("Pick what it's about");
  if (subject.length < 3) back("Add a short summary");
  if (body.length < 1) back("Tell us a little more");
  const h = await headers();
  const context = {
    from: String(form.get("from") ?? "").slice(0, 200) || null,
    error: String(form.get("ref") ?? "").slice(0, 60) || null,
    roles: me.roles, program: me.orgId, host: h.get("host"),
    device: (h.get("user-agent") ?? "").slice(0, 200),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  };
  let id = "";
  try {
    const [r] = await asUser(me.id, (q) => q<{ id: string }>("select open_ticket($1, $2, $3, $4::jsonb, $5) id", [kind, subject, body.slice(0, 5000), JSON.stringify(context), me.orgId]));
    id = r.id;
  } catch (e) {
    back(dbMessage(e));
  }
  void alertStaff(id, "new");
  revalidatePath("/help");
  redirect(`/help/${id}?sent=1`);
}

export async function replyTicket(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!isId(id) || !body) redirect(`/help/${id}`);
  await asUser(me.id, (q) => q("select reply_ticket($1, $2)", [id, body.slice(0, 5000)]));
  void alertStaff(id, "reply");
  revalidatePath(`/help/${id}`);
  redirect(`/help/${id}`);
}

export async function rateTicket(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("id") ?? "");
  const n = Number(form.get("rating"));
  if (!isId(id) || !(n >= 1 && n <= 5)) return;
  await asUser(me.id, (q) => q("select rate_ticket($1, $2)", [id, n]));
  revalidatePath(`/help/${id}`);
  redirect(`/help/${id}?rated=1`);
}
