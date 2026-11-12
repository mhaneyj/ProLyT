"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { track } from "@/lib/track";

const back = (k: string, v: string) => redirect(`/owner/plans?${k}=${encodeURIComponent(v)}`);
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

function read(form: FormData) {
  const dollars = Number(String(form.get("price") ?? "").replace(/[$,\s]/g, ""));
  const per = Number(form.get("per_week"));
  return {
    name: String(form.get("name") ?? "").trim().slice(0, 40),
    price_cents: Number.isFinite(dollars) ? Math.round(dollars * 100) : NaN,
    per_week: Number.isInteger(per) && per > 0 && per <= 14 ? per : null,
    description: String(form.get("description") ?? "").trim().slice(0, 300) || null,
    // One "included" item per line, up to 8.
    includes: String(form.get("includes") ?? "").split("\n").map((l) => l.replace(/^[-•*\s]+/, "").trim().slice(0, 80)).filter(Boolean).slice(0, 8),
    featured: form.get("featured") === "on",
  };
}

export async function savePlan(form: FormData) {
  const me = await requirePerm("billing.manage");
  const id = String(form.get("id") ?? "");
  const p = read(form);
  if (p.name.length < 2) back("error", "Give the plan a name.");
  if (!(p.price_cents >= 100 && p.price_cents <= 500000)) back("error", "Enter a monthly price between $1 and $5,000.");
  try {
    await asUser(me.id, async (q) => {
      // Only one plan can be "Most popular".
      if (p.featured) await q("update plans set featured = false where org_id = $1 and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')", [me.orgId, isId(id) ? id : null]);
      if (isId(id)) {
        await q(`update plans set name = $3, price_cents = $4, sessions_per_week = $5, description = $6, includes = $7, featured = $8
                 where id = $1 and org_id = $2`, [id, me.orgId, p.name, p.price_cents, p.per_week, p.description, p.includes, p.featured]);
      } else {
        await q(`insert into plans (org_id, name, price_cents, sessions_per_week, description, includes, featured, sort)
                 values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(sort), 0) + 1 from plans where org_id = $1))`,
          [me.orgId, p.name, p.price_cents, p.per_week, p.description, p.includes, p.featured]);
      }
    });
  } catch (e) {
    back("error", dbMessage(e));
  }
  await track("plan_saved", { userId: me.id, orgId: me.orgId });
  revalidatePath("/owner/plans");
  back("ok", isId(id) ? "Saved." : "Plan added. Families see it on their training page now.");
}

export async function setPlanActive(form: FormData) {
  const me = await requirePerm("billing.manage");
  const id = String(form.get("id") ?? "");
  if (!isId(id)) return;
  const on = form.get("on") === "1";
  await asUser(me.id, (q) => q("update plans set active = $3 where id = $1 and org_id = $2", [id, me.orgId, on]));
  revalidatePath("/owner/plans");
  back("ok", on ? "Plan is back on." : "Plan turned off. Families already on it keep it; new families can't pick it.");
}

export async function deletePlan(form: FormData) {
  const me = await requirePerm("billing.manage");
  const id = String(form.get("id") ?? "");
  if (!isId(id)) return;
  try {
    await asUser(me.id, (q) => q("delete from plans where id = $1 and org_id = $2", [id, me.orgId]));
  } catch (e) {
    back("error", dbMessage(e));
  }
  revalidatePath("/owner/plans");
  back("ok", "Plan deleted.");
}

export async function setPlanLimit(form: FormData) {
  const me = await requirePerm("billing.manage");
  const m = String(form.get("mode"));
  const mode = m === "block" || m === "charge" ? m : "allow";
  const dollars = Number(String(form.get("extra_price") ?? "").replace(/[$,\s]/g, ""));
  const price = mode === "charge" && Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
  try {
    await asUser(me.id, (q) => q("select set_plan_limit($1, $2, $3)", [me.orgId, mode, price]));
  } catch (e) {
    back("error", dbMessage(e));
  }
  revalidatePath("/owner/plans");
  back("ok", mode === "block" ? "Families can't book past their plan. You can still add them yourself."
    : mode === "charge" ? `Extra sessions are $${(price! / 100).toFixed(price! % 100 ? 2 : 0)}. Families pay when they book one.`
    : "Families can book extra sessions past their plan.");
}
