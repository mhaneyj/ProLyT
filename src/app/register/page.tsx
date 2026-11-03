import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { Card, Kicker, Notice } from "@/components/ui";
import { PoweredBy, ProgramLogo } from "@/components/brand";
import { RegisterForm } from "./form";
import { ConnectForm } from "./connect-form";

export const metadata = { title: "Register an athlete" };

export default async function Register() {
  const me = await getMe();
  if (!me) redirect("/login");
  const brand = await brandBySlug(await currentOrgSlug());
  if (!brand) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <Notice>Open your program&apos;s ProLyt link to register (for example yourprogram.prolyt.com).</Notice>
      </main>
    );
  }
  const { plans, existing } = await asUser(me.id, async (q) => ({
    plans: await q<{ id: string; name: string; price_cents: number; sessions_per_week: number | null }>(
      "select id, name, price_cents, sessions_per_week from plans where org_id = $1 and active order by price_cents", [brand.id]),
    // This family's athletes who already have a ProLyt profile but don't train here yet
    existing: await q<{ id: string; first_name: string; last_name: string; programs: string | null }>(`
      select a.id, a.first_name, a.last_name,
        (select string_agg(o.name, ', ') from program_athletes pa join orgs o on o.id = pa.org_id
          where pa.athlete_id = a.id and pa.status = 'active') programs
      from athletes a join guardians g on g.athlete_id = a.id and g.user_id = $1
      where not exists (select 1 from program_athletes pa where pa.athlete_id = a.id and pa.org_id = $2 and pa.status = 'active')
      order by a.first_name`, [me.id, brand.id]),
  }));

  return (
    <main style={themeVars(brand.brand_color) as React.CSSProperties} className="mx-auto flex max-w-md flex-col gap-5 px-5 py-6 pb-16">
      <Link href="/home" className="text-sm font-semibold">← Back</Link>
      <div className="flex items-center gap-3">
        <ProgramLogo brand={brand} size={48} />
        <div>
          <Kicker>{brand.name}</Kicker>
          <h1 className="mt-1 font-display text-[34px] uppercase leading-none">Register an athlete</h1>
        </div>
      </div>

      {existing.length ? (
        <Card accent>
          <div className="font-semibold">Already on ProLyt?</div>
          <p className="mb-3 mt-1 text-sm text-soft">Bring their profile and verified results with them. {brand.name} only sees it once you connect.</p>
          <ConnectForm athletes={existing} plans={plans} stripe={stripeConfigured} />
        </Card>
      ) : null}

      <div>
        <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">{existing.length ? "Or add a new athlete" : "New athlete"}</h2>
        <p className="mt-1 text-sm text-muted">About 3 minutes. Their ProLyt profile belongs to your family and goes with them to any program.</p>
      </div>
      <RegisterForm plans={plans} stripe={stripeConfigured} />
      <div className="text-center"><PoweredBy /></div>
    </main>
  );
}
