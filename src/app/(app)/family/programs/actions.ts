"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { stripe, stripeConfigured } from "@/lib/stripe";

/** Leave a program. History (results, film, past teams) stays with the athlete; plans stop at the end of the period already paid. */
export async function leaveProgram(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  const org = String(form.get("org") ?? "");
  if (form.get("confirm") !== "yes") redirect(`/family/programs?athlete=${athlete}&error=${encodeURIComponent("Tick the box to confirm.")}`);
  let subs: string[] = [];
  try {
    subs = (await asUser(me.id, (q) => q<{ subscription_id: string }>("select subscription_id from leave_program($1, $2)", [athlete, org]))).map((r) => r.subscription_id);
  } catch (e) {
    redirect(`/family/programs?athlete=${athlete}&error=${encodeURIComponent(dbMessage(e))}`);
  }
  let billing = "";
  if (subs.length) {
    if (stripeConfigured) {
      try {
        for (const s of subs) await stripe().subscriptions.update(s, { cancel_at_period_end: true });
        billing = " Your plan will not renew.";
      } catch (e) {
        console.error("[leave] could not stop subscription", subs, e);
        billing = " We could not stop your plan automatically, so please contact the program and ProLyt support so you are not billed again.";
      }
    } else billing = " Please ask the program to cancel your plan.";
  }
  revalidatePath("/", "layout");
  redirect(`/family/programs?athlete=${athlete}&done=${encodeURIComponent("You left the program." + billing)}`);
}
