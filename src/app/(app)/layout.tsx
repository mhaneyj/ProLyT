import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { isDemo } from "@/lib/db";
import { brandById } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { NavLinks, type NavItem } from "@/components/nav";
import { unreadCount } from "@/lib/messages";
import { hasPasskeyHere } from "@/lib/passkeys";
import { PasskeyNudge } from "@/components/passkey";
import { NameNudge } from "@/components/name-nudge";
import { MARKETPLACE } from "@/lib/trainers";
import { asUser } from "@/lib/db";

const isTrainer = (uid: string) => asUser(uid, (q) => q<{ t: boolean }>("select is_trainer() t")).then((r) => Boolean(r[0]?.t)).catch(() => false);
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
    // Four tabs: the kid lives on Home (card, progress, film, profile); booking gets its own tab.
    items.push({ href: "/family", label: "Home", icon: "home", also: ["/athlete", "/family"] });
    items.push({ href: "/schedule", label: "Schedule", icon: "schedule" });
    items.push(feed);
    if (msgs) items.push(msgs);
  } else if (me.athleteId) {
    items.push({ href: `/athlete/${me.athleteId}`, label: "Me", icon: "profile", also: [`/athlete/${me.athleteId}`] });
    items.push({ href: "/schedule", label: "Schedule", icon: "schedule" });
    items.push(feed);
    if (msgs) items.push(msgs);
  }
  if (!items.length) {
    // Members without a program role yet (a scout, a new adult athlete): the network.
    items.push(feed, { href: "/discover", label: "Find", icon: "profile" });
    if (msgs) items.push(msgs);
  }
  if (MARKETPLACE && await isTrainer(me.id)) items.splice(Math.min(items.length, 4), 0, { href: "/trainer", label: "Trainer", icon: "schedule", match: "/trainer" });
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
          <Link href="/account" aria-label={`Account and sign out: ${me.name ?? "you"}`}
            className="flex size-11 flex-none items-center justify-center rounded-full border border-line bg-panel font-cond text-[14px] font-extrabold uppercase tracking-[1px] text-soft hover:border-gold hover:text-cream">
            {(me.name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?"}
          </Link>
        </header>
        {isDemo ? <div className="mx-5 mt-2 rounded bg-gold/10 px-3 py-1 text-center text-[11px] text-gold">Demo mode · sample data</div> : null}
        <main className="flex flex-1 flex-col gap-4 px-5 pb-36 pt-4">
          {!me.name || me.name === me.email || me.name === "Member" ? <NameNudge /> : !isDemo && !(await hasPasskeyHere(me.id)) ? <PasskeyNudge /> : null}
          {children}
          {brand ? <div className="mt-6 text-center"><PoweredBy /></div> : null}
        </main>
        <NavLinks items={items} />
      </div>
    </div>
  );
}
