"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (href: string) => path === href || (href !== "/coach" && path.startsWith(href + "/")) || (href === "/coach" && path.startsWith("/coach/session"));
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {items.map((i) => (
          <li key={i.href} className="flex-1">
            <Link
              href={i.href}
              aria-current={active(i.href) ? "page" : undefined}
              className={`flex min-h-16 items-center justify-center font-cond text-[14px] font-extrabold uppercase tracking-[1.5px] ${
                active(i.href) ? "text-gold" : "text-muted hover:text-cream"
              }`}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
