import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Button, Card, Notice, Pill, SectionLabel } from "@/components/ui";
import { AdminTabs } from "../tabs";
import { recordSignoff, reviewBrand, setFlag } from "./actions";

export const metadata = { title: "NIL · ProLyt admin" };

export default async function Nil({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const me = await requirePlatformAdmin();
  const d = await asUser(me.id, async (q) => ({
    flags: await q<{ key: string; enabled: boolean }>("select key, enabled from platform_flags where key in ('nil_marketplace','nil_payouts')"),
    signoffs: await q<{ reviewer: string; firm: string | null; created_at: string }>("select reviewer, firm, created_at::text from nil_signoffs order by created_at desc limit 5"),
    brands: await q<{ id: string; name: string; contact_email: string; status: string }>("select id, name, contact_email, status from nil_brands order by (status = 'pending') desc, created_at desc limit 50"),
    deals: (await q<{ n: number }>("select count(*)::int n from nil_deals"))[0].n,
  }));
  const on = (k: string) => d.flags.find((f) => f.key === k)?.enabled ?? false;
  const flag = (key: string, label: string, hint: string, locked = false) => (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><div className="font-semibold">{label}</div><div className="text-xs text-muted">{hint}</div></div>
        <Pill tone={on(key) ? "good" : "muted"}>{on(key) ? "On" : "Off"}</Pill>
      </div>
      <form action={setFlag} className="mt-3"><input type="hidden" name="key" value={key} /><input type="hidden" name="on" value={on(key) ? "0" : "1"} />
        <Button kind={on(key) ? "ghost" : "primary"} type="submit" disabled={locked && !on(key)}>{on(key) ? "Turn off" : "Turn on"}</Button></form>
    </Card>
  );
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">NIL</h1>
      <AdminTabs on="nil" />
      {error ? <Notice tone="bad">{error}</Notice> : saved ? <Notice tone="good">{saved}</Notice> : null}
      <Notice>The infrastructure is built and dark. Families can&apos;t see any of it until the marketplace switch is on. No money moves from ProLyt either way: payouts stay on hold.</Notice>
      <SectionLabel>Switches</SectionLabel>
      {flag("nil_marketplace", "NIL marketplace", "Parent-run profiles, approved brands, offers and parent approval. Blocks school, uniform, coach and booster wording.")}
      {flag("nil_payouts", "Payout release", on("nil_marketplace") ? "Locked until a legal sign-off is recorded below." : "Turn the marketplace on first.", !on("nil_marketplace") || d.signoffs.length === 0)}
      <SectionLabel>Legal sign-off</SectionLabel>
      <Card>
        {d.signoffs.length ? <ul className="mb-3 text-sm">{d.signoffs.map((s) => <li key={s.created_at}>{s.reviewer}{s.firm ? `, ${s.firm}` : ""} · {s.created_at.slice(0, 10)}</li>)}</ul> : <p className="mb-3 text-sm text-muted">None yet. Book the California sports/NIL attorney before payouts.</p>}
        <form action={recordSignoff} className="flex flex-col gap-2">
          <input name="reviewer" required minLength={2} placeholder="Attorney name" className="min-h-12 rounded-md border border-line bg-panel px-3" />
          <input name="firm" placeholder="Firm" className="min-h-12 rounded-md border border-line bg-panel px-3" />
          <input name="note" placeholder="What they approved" className="min-h-12 rounded-md border border-line bg-panel px-3" />
          <Button kind="ghost" type="submit">Record sign-off</Button>
        </form>
      </Card>
      <SectionLabel>Brands ({d.deals} deals)</SectionLabel>
      {d.brands.length === 0 ? <p className="text-sm text-muted">No brands yet.</p> : d.brands.map((b) => (
        <Card key={b.id}>
          <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><div className="truncate font-semibold">{b.name}</div><div className="truncate text-xs text-muted">{b.contact_email}</div></div>
            <Pill tone={b.status === "approved" ? "good" : b.status === "pending" ? "warn" : "bad"}>{b.status}</Pill></div>
          {b.status === "pending" ? (
            <form action={reviewBrand} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="id" value={b.id} />
              <Button kind="primary" name="ok" value="1" type="submit">Approve</Button><Button kind="ghost" name="ok" value="0" type="submit">Reject</Button></form>
          ) : null}
        </Card>
      ))}
    </>
  );
}
