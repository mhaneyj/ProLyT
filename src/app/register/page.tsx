import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";
import { Kicker } from "@/components/ui";
import { RegisterForm } from "./form";

export const metadata = { title: "Register an athlete" };

export default async function Register() {
  const me = await getMe();
  if (!me) redirect("/login");
  const plans = await asUser(me.id, (q) =>
    q<{ id: string; name: string; price_cents: number; sessions_per_week: number | null }>(
      "select p.id, p.name, p.price_cents, p.sessions_per_week from plans p join orgs o on o.id = p.org_id where o.slug = $1 and p.active order by p.price_cents",
      [process.env.NEXT_PUBLIC_ORG_SLUG ?? "gamefit-loomis"],
    ),
  );
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 py-6 pb-16">
      <Link href="/home" className="text-sm font-semibold">← Back</Link>
      <div>
        <Kicker>Game-Fit Loomis</Kicker>
        <h1 className="mt-1 font-display text-[36px] uppercase leading-none">Register an athlete</h1>
        <p className="mt-2 text-sm text-muted">About 3 minutes. You can add more athletes after.</p>
      </div>
      <RegisterForm plans={plans} stripe={stripeConfigured} />
    </main>
  );
}
