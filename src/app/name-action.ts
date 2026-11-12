"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

/** First-run "What's your name?" — coaches, hosts and families see names, not email addresses. */
export async function setMyName(form: FormData) {
  const me = await requireMe();
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2 || name.includes("@")) return;
  await asUser(me.id, (q) => q("update profiles set full_name = $2 where id = $1", [me.id, name]));
  revalidatePath("/", "layout");
}

/** "Not now" on the name prompt: hide it for two weeks on this device. */
export async function laterName() {
  (await cookies()).set("name_later", "1", { maxAge: 60 * 60 * 24 * 14, path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}
