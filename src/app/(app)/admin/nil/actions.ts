"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const back = (msg?: { error?: string; saved?: string }) => {
  revalidatePath("/admin/nil");
  redirect(`/admin/nil${msg?.error ? `?error=${encodeURIComponent(msg.error)}` : msg?.saved ? `?saved=${encodeURIComponent(msg.saved)}` : ""}`);
};

export async function setFlag(form: FormData) {
  const me = await requirePlatformAdmin();
  const key = String(form.get("key") ?? "");
  const on = form.get("on") === "1";
  try { await asUser(me.id, (q) => q("select set_platform_flag($1, $2)", [key, on])); } catch (e) { back({ error: dbMessage(e) }); }
  back({ saved: on ? "Switched on" : "Switched off" });
}

export async function recordSignoff(form: FormData) {
  const me = await requirePlatformAdmin();
  const reviewer = String(form.get("reviewer") ?? "").slice(0, 120);
  try {
    await asUser(me.id, (q) => q("select record_nil_signoff($1, $2, $3)", [reviewer, String(form.get("firm") ?? "").slice(0, 120), String(form.get("note") ?? "").slice(0, 1000)]));
  } catch (e) { back({ error: dbMessage(e) }); }
  back({ saved: "Sign-off recorded" });
}

export async function reviewBrand(form: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(form.get("id") ?? "");
  if (!isId(id)) return;
  await asUser(me.id, (q) => q("select review_nil_brand($1, $2)", [id, form.get("ok") === "1"]));
  back({ saved: "Brand reviewed" });
}
