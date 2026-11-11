import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { feePercent, priceWithFee } from "@/lib/fees";
import { stripe, stripeConfigured, siteUrl } from "@/lib/stripe";

// Starts a monthly membership checkout for one athlete the signed-in parent registered.
async function start(request: NextRequest, athleteId: string | null) {
  const base = siteUrl(request.nextUrl.origin);
  const uid = await currentUserId();
  if (!uid) return NextResponse.redirect(`${base}/login`, 303);
  if (!athleteId) return NextResponse.redirect(`${base}/family`, 303);
  if (!stripeConfigured) return NextResponse.redirect(`${base}/family?error=${encodeURIComponent("Online payments aren't switched on yet. Your coach will tell you how to pay.")}`, 303);

  const m = await asUser(uid, async (q) => {
    const [row] = await q<{ membership_id: string; org_id: string; program: string; plan: string; price_cents: number; first_name: string; email: string | null }>(
      `select ms.id membership_id, p.org_id, o.name program, p.name plan, p.price_cents, a.first_name, pr.email
       from memberships ms join athletes a on a.id = ms.athlete_id join plans p on p.id = ms.plan_id
       join orgs o on o.id = p.org_id
       join guardians g on g.athlete_id = a.id and g.user_id = $2
       left join profiles pr on pr.id = $2
       where a.id = $1 and ms.status = 'pending' order by ms.created_at desc limit 1`,
      [athleteId, uid],
    );
    return row;
  });
  if (!m) return NextResponse.redirect(`${base}/family`, 303);
  // ProLyt can switch online payments off per program
  const [f] = await asUser(uid, (q) => q<{ on: boolean; paid_by: "program" | "family" }>("select coalesce((features->>'payments')::boolean, true) on, fee_paid_by paid_by from orgs where id = $1", [m.org_id]));
  if (!f?.on) return NextResponse.redirect(`${base}/family?chosen=1`, 303);
  const { feeCents } = priceWithFee(m.price_cents, f.paid_by);
  await asService((q) => q("update memberships set fee_paid_by = $2 where id = $1", [m.membership_id, f.paid_by]));

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: m.email ?? undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: m.price_cents,
        recurring: { interval: "month" },
        product_data: { name: `${m.program} · ${m.plan} membership · ${m.first_name}` },
      },
    }, ...(f.paid_by === "family" && feeCents > 0 ? [{
      quantity: 1,
      price_data: { currency: "usd", unit_amount: feeCents, recurring: { interval: "month" as const }, product_data: { name: `Service fee (${feePercent()})` } },
    }] : [])],
    metadata: { membership_id: m.membership_id, org_id: m.org_id },
    subscription_data: { metadata: { membership_id: m.membership_id, org_id: m.org_id } },
    success_url: `${base}/family?paid=1`,
    cancel_url: `${base}/family`,
  });
  return NextResponse.redirect(session.url!, 303);
}

export async function GET(request: NextRequest) {
  return start(request, request.nextUrl.searchParams.get("athlete_id"));
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  return start(request, String(form.get("athlete_id") ?? "") || null);
}
