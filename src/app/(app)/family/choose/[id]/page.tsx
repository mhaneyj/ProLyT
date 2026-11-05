import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Notice, Title } from "@/components/ui";

export const metadata = { title: "Choose a package" };

type Plan = { id: string; name: string; price_cents: number; sessions_per_week: number | null; program: string };

async function choose(form: FormData) {
  "use server";
  const me = await requireRole("guardian");
  const athlete = String(form.get("athlete") ?? "");
  const plan = String(form.get("plan") ?? "");
  try {
    await asUser(me.id, (q) => q("select choose_plan($1, $2)", [athlete, plan]));
  } catch (e) {
    redirect(`/family/choose/${athlete}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath("/family");
  if (stripeConfigured) redirect(`/api/stripe/checkout?athlete_id=${athlete}`);
  redirect("/family?chosen=1");
}

export default async function ChoosePackage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const me = await requireRole("guardian");
  const data = await asUser(me.id, async (q) => {
    const [a] = await q<{ first_name: string }>(
      "select a.first_name from athletes a join guardians g on g.athlete_id = a.id and g.user_id = $2 where a.id = $1", [id, me.id]);
    if (!a) return null;
    // Packages from every program this athlete is connected to
    const plans = await q<Plan>(`
      select p.id, p.name, p.price_cents, p.sessions_per_week, o.name program
      from plans p join orgs o on o.id = p.org_id
      join program_athletes pa on pa.org_id = p.org_id and pa.athlete_id = $1 and pa.status = 'active'
      where p.active order by o.name, p.price_cents`, [id]);
    return { a, plans };
  });
  if (!data) notFound();

  return (
    <>
      <Link href="/family" className="text-sm font-semibold">← Home</Link>
      <Title sub="Free access stays on until you pick one. You can change an unpaid pick anytime.">Choose a package for {data.a.first_name}</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {data.plans.length === 0 ? <Notice>This program hasn&apos;t posted packages yet.</Notice> : null}
      {data.plans.map((p) => (
        <form key={p.id} action={choose}>
          <input type="hidden" name="athlete" value={id} />
          <input type="hidden" name="plan" value={p.id} />
          <Card className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-muted">
                {[p.sessions_per_week ? `${p.sessions_per_week} session${p.sessions_per_week > 1 ? "s" : ""} a week` : null, p.program].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="text-right">
              <div className="tabular font-display text-2xl">{money(p.price_cents)}<span className="font-sans text-xs text-muted">/mo</span></div>
              <button className="mt-1 min-h-11 rounded-md bg-gold px-4 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold">
                {stripeConfigured ? "Choose & pay" : "Choose"}
              </button>
            </div>
          </Card>
        </form>
      ))}
    </>
  );
}
