import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ago } from "@/lib/domain/format";
import { KINDS, STATUS } from "@/lib/support";
import { Notice, Pill, Title } from "@/components/ui";
import { openTicket } from "./actions";

export const metadata = { title: "Help & feedback" };

type T = { id: string; number: number; subject: string; status: string; updated_at: string };

export default async function Help({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string; ref?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const mine = await asUser(me.id, (q) => q<T>("select id, number, subject, status, updated_at::text from tickets where user_id = $1 order by updated_at desc limit 20", [me.id]));
  const kind = KINDS.some((k) => k[0] === sp.kind) ? sp.kind : sp.ref ? "bug" : undefined;
  const family = me.roles.includes("guardian");

  return (
    <>
      <Title sub="Goes straight to the ProLyt team. We usually reply within a day.">Help &amp; feedback</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {sp.ref ? <Notice>Sorry about that error. Tell us what you were doing and we&apos;ll fix it. We already have the technical details.</Notice> : null}
      {family && me.features.messaging ? (
        <Link href="/messages" className="rounded-[14px] border border-line bg-panel px-4 py-3 text-sm hover:border-gold">
          <span className="font-semibold">About sessions, schedule or your athlete?</span> <span className="text-muted">Your coaches answer those. Message them →</span>
        </Link>
      ) : null}
      <form action={openTicket} className="flex flex-col gap-3">
        <input type="hidden" name="from" value={sp.from ?? ""} /><input type="hidden" name="ref" value={sp.ref ?? ""} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">What&apos;s it about?</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([k, l]) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="kind" value={k} defaultChecked={k === kind} required className="peer sr-only" />
                <span className="flex min-h-11 items-center rounded-full border-2 border-line px-4 text-sm font-semibold peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold">{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-semibold">Summary
          <input name="subject" required minLength={3} maxLength={120} placeholder="Book button doesn't do anything" className="min-h-12 rounded-md border border-line bg-panel px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Details
          <textarea name="body" required rows={5} maxLength={5000} placeholder="What happened, and what did you expect?" className="rounded-md border border-line bg-panel p-3 font-normal" />
        </label>
        <p className="text-[12px] text-muted">We attach the page you were on, your device and app version so you don&apos;t have to. Never your password or payment details.</p>
        <button className="min-h-14 rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold">Send</button>
      </form>
      {mine.length ? (
        <section className="flex flex-col gap-2" aria-label="Your requests">
          <span className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Your requests</span>
          {mine.map((t) => (
            <Link key={t.id} href={`/help/${t.id}`} className="flex items-center gap-3 rounded-[12px] border border-line bg-panel px-4 py-3 hover:border-gold">
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t.subject}</span><span className="block text-[12px] text-muted">#{t.number} · {ago(t.updated_at)}</span></span>
              <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}
