import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { signOut } from "@/app/sign-out";
import { isDemo } from "@/lib/db";
import { brandById } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { NavLinks, type NavItem } from "@/components/nav";
import { familyKids } from "@/lib/kid";
import { unreadCount } from "@/lib/messages";
import { hasPasskeyHere } from "@/lib/passkeys";
import { PasskeyNudge } from "@/components/passkey";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  if (me.orgPaused && !me.isPlatformAdmin) redirect(homeFor(me));
  const brand = await brandById(me.orgId);
  const items: NavItem[] = [];
  const staff = me.roles.includes("coach") || me.roles.includes("owner");
  const chat = me.features.messaging;
  const feed: NavItem = { href: "/feed", label: "Feed", icon: "feed", match: "/feed" };
  const msgs: NavItem | null = chat ? { href: "/messages", label: "Messages", icon: "chat", badge: await unreadCount(me.id) } : null;
  if (staff) {
    if (me.roles.includes("owner")) items.push({ href: "/owner", label: "Dashboard", icon: "dashboard" });
    items.push({ href: "/coach", label: "Today", icon: "today" });
    items.push(feed);
    if (msgs) items.push(msgs);
    if (me.orgId) items.push({ href: "/schedule", label: "Schedule", icon: "schedule" });
    if (me.roles.includes("coach") && !me.roles.includes("owner")) items.push({ href: "/coach/earnings", label: "Earnings", icon: "money" });
    if (me.roles.includes("guardian") || me.isParent) items.push({ href: "/family", label: "Family", icon: "home" });
  } else if (me.roles.includes("guardian") || me.isParent) {
    const { current } = await familyKids(me.id);
    items.push({ href: "/family", label: "Home", icon: "home" });
    items.push(feed);
    if (msgs) items.push(msgs);
    if (current) {
      items.push({ href: `/athlete/${current.id}/progress`, label: "Progress", icon: "progress" });
      items.push({ href: `/athlete/${current.id}/film`, label: "Film", icon: "film" });
    }
    if (!msgs) items.push({ href: "/schedule", label: "Schedule", icon: "schedule" }); // reachable from Home
    if (current) items.push({ href: `/athlete/${current.id}`, label: "Profile", icon: "profile" });
  } else if (me.athleteId) {
    items.push(feed);
    items.push({ href: `/athlete/${me.athleteId}`, label: "Me", icon: "profile" });
    if (msgs) items.push(msgs);
    items.push({ href: `/athlete/${me.athleteId}/progress`, label: "Progress", icon: "progress" });
    items.push({ href: `/athlete/${me.athleteId}/film`, label: "Film", icon: "film" });
    items.push({ href: "/schedule", label: "Schedule", icon: "schedule" });
  }
  if (!items.length) {
    // Members without a program role yet (a scout, a new adult athlete): the network.
    items.push(feed, { href: "/discover", label: "Find", icon: "profile" });
    if (msgs) items.push(msgs);
  }
  if (me.isPlatformAdmin) items.push({ href: "/admin", label: "ProLyt", icon: "admin" });

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
        <main className="flex flex-1 flex-col gap-4 px-5 pb-36 pt-4">
          {!isDemo && !(await hasPasskeyHere(me.id)) ? <PasskeyNudge /> : null}
          {children}
          {brand ? <div className="mt-6 text-center"><PoweredBy /></div> : null}
        </main>
        <NavLinks items={items} />
      </div>
    </div>
  );
}
