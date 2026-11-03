import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMe, DEMO_COOKIE } from "@/lib/auth";
import { isDemo } from "@/lib/db";
import { brandById } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { supabaseServer } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

async function signOut() {
  "use server";
  if (isDemo) (await cookies()).delete(DEMO_COOKIE);
  else await (await supabaseServer()).auth.signOut();
  redirect("/");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const brand = await brandById(me.orgId);
  const items: { href: string; label: string }[] = [];
  if (me.roles.includes("owner")) items.push({ href: "/owner", label: "Dashboard" });
  if (me.roles.includes("coach")) items.push({ href: "/coach", label: "Today" }, { href: "/coach/earnings", label: "Earnings" });
  if (me.roles.includes("guardian")) items.push({ href: "/family", label: "Home" });
  if (me.orgId) items.push({ href: "/schedule", label: "Schedule" });
  if (me.isPlatformAdmin) items.push({ href: "/admin", label: "ProLyt" });

  return (
    <div style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          <Link href="/home" className="flex min-w-0 items-center gap-2.5">
            {brand ? (
              <>
                <ProgramLogo brand={brand} size={36} />
                <span className="truncate font-cond text-[15px] font-extrabold uppercase tracking-[2px]">{brand.name}</span>
              </>
            ) : (
              <ProLytMark className="text-2xl" />
            )}
          </Link>
          <form action={signOut} className="flex-none">
            <button className="min-h-11 px-1 text-xs text-muted hover:text-cream">{me.name} · Sign out</button>
          </form>
        </header>
        {isDemo ? <div className="mx-5 mt-2 rounded bg-gold/10 px-3 py-1 text-center text-[11px] text-gold">Demo mode · sample data</div> : null}
        <main className="flex flex-1 flex-col gap-4 px-5 pb-32 pt-4">
          {children}
          {brand ? <div className="mt-6 text-center"><PoweredBy /></div> : null}
        </main>
        <NavLinks items={items} />
      </div>
    </div>
  );
}
