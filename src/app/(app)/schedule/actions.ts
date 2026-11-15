"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { offerNext } from "@/lib/waitlist";

async function run(form: FormData, fn: "book_session" | "cancel_booking" | "join_waitlist" | "leave_waitlist" | "book_with_credit") {
  const me = await requireRole("guardian");
  if (!me.features.booking) redirect(`/schedule?error=${encodeURIComponent("Booking is handled by your coach.")}`);
  const session = String(form.get("session") ?? "");
  const athlete = String(form.get("athlete") ?? "");
  try {
    await asUser(me.id, (q) => q(`select ${fn}($1, $2)`, [session, athlete]));
  } catch (e) {
    redirect(`/schedule?error=${encodeURIComponent(dbMessage(e))}`);
  }
  // A freed spot (cancelled booking, or an offer handed back) goes to the next family in line.
  if (fn === "cancel_booking" || fn === "leave_waitlist") await offerNext(session).catch((e) => console.error("[waitlist] offer failed:", e));
  revalidatePath("/schedule");
  revalidatePath("/family");
}

export async function book(form: FormData) { await run(form, "book_session"); }
export async function cancel(form: FormData) { await run(form, "cancel_booking"); }

export async function joinWaitlist(form: FormData) { await run(form, "join_waitlist"); }
export async function leaveWaitlist(form: FormData) { await run(form, "leave_waitlist"); }
export async function bookWithCredit(form: FormData) { await run(form, "book_with_credit"); }
