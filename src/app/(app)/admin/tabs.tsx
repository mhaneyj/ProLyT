import Link from "next/link";

export function AdminTabs({ on }: { on: "programs" | "people" | "growth" | "reports" | "checks" | "activity" }) {
  const t = (k: typeof on, href: string, label: string) => (
    <Link href={href} aria-current={on === k ? "page" : undefined}
      className={`flex min-h-11 flex-none items-center justify-center whitespace-nowrap rounded-full px-3.5 text-sm font-bold ${on === k ? "bg-gold text-on-gold" : "text-soft hover:text-cream"}`}>{label}</Link>
  );
  return (
    <nav aria-label="Admin" className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none]">
      {t("programs", "/admin", "Programs")}{t("people", "/admin/people", "People")}{t("growth", "/admin/growth", "Growth")}{t("reports", "/admin/reports", "Safety")}{t("checks", "/admin/checks", "Ages")}{t("activity", "/admin/activity", "Activity")}
    </nav>
  );
}
