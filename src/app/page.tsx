import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { Kicker, LinkButton } from "@/components/ui";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

export default async function Welcome() {
  const me = await getMe();
  if (me) redirect(homeFor(me));
  const brand = await brandBySlug(await currentOrgSlug());

  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={96} /> : <ProLytMark className="text-4xl" />}
      <div className="mt-auto flex flex-col gap-4 pb-4">
        <Kicker>{brand ? `${brand.name} · Athlete portal` : "Athlete development platform"}</Kicker>
        <h1 className="font-display text-[52px] uppercase leading-[0.95]">
          Train it.
          <br />
          Track it.
          <br />
          <span className="text-gold">ProLyt.</span>
        </h1>
        <p className="text-soft">Your progress, highlighted. Schedules, verified results and monthly reports for every athlete, in one place for families and coaches.</p>
        <LinkButton href="/login">Sign in</LinkButton>
        {brand ? <LinkButton href="/register" kind="ghost">Register an athlete</LinkButton> : null}
        {brand ? <div className="mt-2 text-center"><PoweredBy /></div> : null}
      </div>
    </main>
  );
}
