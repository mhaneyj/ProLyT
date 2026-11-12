"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { alertRequester } from "@/lib/support";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** Reply (optional) and set the status. A reply tells the person by notification and email. */
export async function staffReply(form: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  const status = String(form.get("status") ?? "");
  if (!isId(id)) return;
  await asUser(me.id, (q) => q("select reply_ticket($1, $2, $3)", [id, body, ["open", "waiting", "resolved"].includes(status) ? status : null]));
  if (body) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    // Their link goes to the program they were in, so they land signed in.
    const [t] = await asUser(me.id, (q) => q<{ host: string | null }>("select context->>'host' host from tickets where id = $1", [id]));
    void alertRequester(id, `${host.includes("localhost") ? "http" : "https"}://${t?.host ?? host}`);
  }
  revalidatePath("/admin/support");
  redirect(`/admin/support/${id}?saved=1`);
}

export async function setPriority(form: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(form.get("id") ?? "");
  if (!isId(id)) return;
  await asUser(me.id, (q) => q("select admin_ticket_priority($1, $2)", [id, form.get("priority") === "high" ? "high" : "normal"]));
  revalidatePath(`/admin/support/${id}`);
  redirect(`/admin/support/${id}`);
}
