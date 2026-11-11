"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; match?: string; also?: string[]; badge?: number };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // Most specific match wins, so /athlete/x/film lights "Film", not "Profile".
  const score = (i: NavItem) => {
    const m = i.match ?? i.href;
    if (path === m || path === i.href) return 1000;
    if (path.startsWith(m + "/")) return m.length;
    // Extra sections that belong to this tab (a family's athlete pages light up Home).
    const extra = (i.also ?? []).filter((p) => path === p || path.startsWith(p + "/")).map((p) => p.length);
    return extra.length ? Math.max(...extra) : -1;
  };
  const best = items.reduce((b, i) => (score(i) > score(b) ? i : b), items[0]);
  const activeHref = best && score(best) >= 0 ? best.href : null;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-[#1f1f1f] bg-[#0b0b0b]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md px-1">
        {items.map((i) => {
          const on = i.href === activeHref;
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={on ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? "text-gold" : "text-[#8c877c] hover:text-cream"}`}>
                <span className="relative">
                  <Icon name={i.icon} />
                  {i.badge ? <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-gold px-1 text-center text-[10px] leading-[18px] text-on-gold" aria-label={`${i.badge} unread`}>{i.badge > 9 ? "9+" : i.badge}</span> : null}
                </span>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
