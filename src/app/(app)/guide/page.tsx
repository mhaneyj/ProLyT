import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { forRole, roleOf, type Role } from "@/lib/guide";
import { Title } from "@/components/ui";
import { AskBox } from "./ask-box";

export const metadata = { title: "Guide" };

const SUGGEST: Record<Role, string[]> = {
  family: ["How do I book a session?", "What is a waitlist spot?", "How do packs work?", "Why can't I see my athlete's name on the rankings?"],
  coach: ["How do I get paid?", "How do I run testing day?", "How do I set a goal for a kid?", "What happens when I remove a kid from a full session?"],
  owner: ["How do I create a session pack?", "How do coaches get paid?", "How do I add a sponsor?", "Who can see an athlete's goals?"],
};

export default async function Guide({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const mine = roleOf(me.roles);
  const view: Role = (["family", "coach", "owner"] as const).find((r) => r === sp.as && me.roles.some((x) => (r === "family" ? x === "guardian" : x === r || (r === "coach" && x === "owner")))) ?? mine;
  const topics = forRole(view);
  const tabs = ([["family", "Families"], ["coach", "Coaches"], ["owner", "Owners"]] as const).filter(([r]) => r === mine || r === "family" || (r === "coach" && mine === "owner"));
  return (
    <>
      <Title sub="How ProLyt works, in plain steps.">Guide</Title>
      <AskBox suggestions={SUGGEST[view]} />
      {tabs.length > 1 ? (
        <nav aria-label="Guide for" className="flex gap-2">
          {tabs.map(([r, label]) => (
            <Link key={r} href={`/guide?as=${r}`} aria-current={view === r ? "page" : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full border text-sm font-semibold ${view === r ? "border-gold bg-gold text-on-gold" : "border-line text-soft"}`}>{label}</Link>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-col gap-2">
        {topics.map((t) => (
          <details key={t.id} id={t.id} className="rounded-[14px] border border-line bg-panel px-4 open:border-gold/50">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 font-semibold">{t.title}</summary>
            <div className="pb-4 text-sm text-soft">
              <p>{t.summary}</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              {t.href ? <Link href={t.href} className="mt-3 inline-flex min-h-11 items-center font-bold text-gold">{t.linkLabel ?? "Open"} →</Link> : null}
            </div>
          </details>
        ))}
      </div>
      <Link href="/help" className="flex min-h-12 items-center justify-center rounded-md border border-line bg-panel text-sm font-semibold hover:border-gold">Still stuck? Send feedback to the team</Link>
    </>
  );
}
