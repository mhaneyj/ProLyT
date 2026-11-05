"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

async function run(form: FormData, fn: "book_session" | "cancel_booking") {
  const me = await requireRole("guardian");
  const session = String(form.get("session") ?? "");
  const athlete = String(form.get("athlete") ?? "");
  try {
    await asUser(me.id, (q) => q(`select ${fn}($1, $2)`, [session, athlete]));
  } catch (e) {
    redirect(`/schedule?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath("/schedule");
  revalidatePath("/family");
}

export async function book(form: FormData) { await run(form, "book_session"); }
export async function cancel(form: FormData) { await run(form, "cancel_booking"); }
