import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice } from "@/components/ui";
import { PrintButton } from "./print-button";

export const metadata = { title: "Sponsor one-pager" };

const GET = [
  ["Your name on every player card", "\"Presented by\" appears on each athlete's ProLyt Player Card, the one kids show friends and post."],
  ["Seen at the pack reveal", "Every time an athlete rips open a new card, your name is on it."],
  ["In every parent's monthly report", "A thank-you line in the emailed progress report and on the report page, every month."],
  ["Backing real development", "Your support funds coaching, testing days and training for local athletes."],
];

export default async function Sponsor({ searchParams }: { searchParams: Promise<{ price?: string }> }) {
  const me = await requirePerm("brand.manage");
  const { price } = await searchParams;
  const d = await asUser(me.id, async (q) => {
    const [o] = await q<{ name: string; sponsor: string | null }>("select name, card_sponsor sponsor from orgs where id = $1", [me.orgId]);
    const [n] = await q<{ n: number }>("select count(*)::int n from program_athletes where org_id = $1 and status = 'active'", [me.orgId]);
    return { ...o, athletes: n.n };
  });
  const amount = (price ?? "").replace(/[^0-9a-zA-Z $,./-]/g, "").slice(0, 40);
  return (
    <>
      <Link href="/owner/settings#sponsor" className="min-h-11 py-3 text-sm text-muted hover:text-cream print:hidden">← Settings</Link>
      <Notice>Print this or save it as a PDF and hand it to local businesses. Add the price you want to charge below. Money goes to your program, never to an athlete.</Notice>
      <form className="flex gap-2 print:hidden"><input name="price" defaultValue={amount} placeholder="e.g. $500 per season" className="min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /><button className="min-h-12 rounded-md border-2 border-[#3a3a3a] px-4 font-cond font-extrabold uppercase">Set</button></form>
      <Card className="print:border-0 print:bg-white print:text-black">
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold print:text-black">Sponsor {d.name}</div>
        <h1 className="mt-1 font-display text-[34px] uppercase leading-[1.05]">Put your name on the next generation of local athletes</h1>
        <p className="mt-3 text-sm text-soft print:text-black">{d.name} trains local athletes and gives every one a ProLyt Player Card: a real photo card with their verified test results, built to be collected and shared. As a sponsor, your business is &ldquo;Presented by&rdquo; on all of them.</p>
        {d.athletes > 0 ? <p className="mt-3 font-display text-[28px]">{d.athletes} <span className="font-sans text-sm text-muted print:text-black">athletes and their families today</span></p> : null}
        <ul className="mt-4 flex flex-col gap-3">
          {GET.map(([t, s]) => <li key={t}><div className="font-semibold">{t}</div><div className="text-sm text-soft print:text-black">{s}</div></li>)}
        </ul>
        {amount ? <p className="mt-5 rounded-md border border-line px-4 py-3 font-semibold print:border-black">Sponsorship: {amount}</p> : null}
        <p className="mt-4 text-[12px] text-muted print:text-black">Sponsorships support the program only. No athlete is paid, and no school name, team uniform or logo is used. Contact {d.name} to get started.</p>
      </Card>
      <PrintButton />
    </>
  );
}
