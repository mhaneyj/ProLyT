import Link from "next/link";

export function AdminTabs({ on }: { on: "programs" | "people" | "growth" | "reports" | "activity" }) {
  const t = (k: typeof on, href: string, label: string) => (
    <Link href={href} aria-current={on === k ? "page" : undefined}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-bold ${on === k ? "bg-gold text-on-gold" : "text-soft hover:text-cream"}`}>{label}</Link>
  );
  return (
    <nav aria-label="Admin" className="flex gap-1 rounded-full border border-line p-1">
      {t("programs", "/admin", "Programs")}{t("people", "/admin/people", "People")}{t("growth", "/admin/growth", "Growth")}{t("reports", "/admin/reports", "Safety")}{t("activity", "/admin/activity", "Activity")}
    </nav>
  );
}
