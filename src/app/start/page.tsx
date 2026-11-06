import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { Icon } from "@/components/icons";
import { Kicker } from "@/components/ui";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

export const metadata = { title: "Get started" };

export default async function Start() {
  const me = await requireMe();
  const home = homeFor(me);
  if (home !== "/start") redirect(home);
  const brand = await brandBySlug(await currentOrgSlug());
  const card = (href: string, title: string, sub: string) => (
    <Link href={href} className="flex min-h-24 items-center gap-4 rounded-[14px] border border-line bg-panel px-5 hover:border-gold">
      <span className="flex-1"><span className="block text-lg font-semibold">{title}</span><span className="block text-sm text-muted">{sub}</span></span>
      <Icon name="chevron" className="text-gold" />
    </Link>
  );
  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={72} /> : <ProLytMark className="text-4xl" />}
      <div>
        <Kicker>{brand?.name ?? "ProLyt"}</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Who&apos;s signing up?</h1>
      </div>
      {card("/start/athlete", "I'm an athlete", "13 or older. Build your profile: film, numbers, teams.")}
      {brand
        ? card("/register", "I'm a parent", `Register your athlete with ${brand.name}.`)
        : <p className="rounded-[14px] border border-line px-5 py-4 text-sm text-soft"><span className="font-semibold text-cream">Parent?</span> Open your program&apos;s ProLyt link to register your athlete, or approve your teen&apos;s profile from the email they sent you.</p>}
      <p className="text-xs text-muted">Coaches: use the invite link your program sent you.</p>
      <div className="mt-auto text-center"><PoweredBy /></div>
    </main>
  );
}
