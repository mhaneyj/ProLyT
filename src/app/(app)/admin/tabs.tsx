import Link from "next/link";
import { ScrollActive } from "@/components/scroll-active";

export function AdminTabs({ on }: { on: "health" | "support" | "programs" | "people" | "growth" | "reports" | "checks" | "trainers" | "activity" | "nil" | "colleges" }) {
  const t = (k: typeof on, href: string, label: string) => (
    <Link href={href} aria-current={on === k ? "page" : undefined}
      className={`flex min-h-11 flex-none items-center justify-center whitespace-nowrap rounded-full px-3.5 text-sm font-bold ${on === k ? "bg-gold text-on-gold" : "text-soft hover:text-cream"}`}>{label}</Link>
  );
  return (
    <ScrollActive label="Admin" className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none]">
      {t("health", "/admin/health", "Health")}{t("support", "/admin/support", "Support")}{t("programs", "/admin", "Programs")}{t("people", "/admin/people", "People")}{t("growth", "/admin/growth", "Growth")}{t("reports", "/admin/reports", "Safety")}{t("checks", "/admin/checks", "Ages")}{t("trainers", "/admin/trainers", "Trainers")}{t("activity", "/admin/activity", "Activity")}{t("nil", "/admin/nil", "NIL")}{t("colleges", "/admin/colleges", "Colleges")}
    </ScrollActive>
  );
}
