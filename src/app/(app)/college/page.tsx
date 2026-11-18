import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { METRICS } from "@/lib/domain/metrics";
import { Card, Notice, Title } from "@/components/ui";
import { applyCollege } from "./actions";

export const metadata = { title: "College Coach Pass" };

type Row = { athlete_id: string; first_name: string; last_name: string; pos: string | null; grad_year: number | null; hometown: string | null; school: string | null; watched: boolean; results: { metric: string; value: number }[] | null };
const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K"];
const SEARCH_METRICS = ["40yd", "10yd", "pro_agility", "three_cone", "vertical", "broad"];
const PAGE = 30;
const input = "min-h-11 w-full rounded-md border border-line bg-panel px-3 text-[16px]";
const fmt = (m: string, v: number) => `${METRICS[m]?.short ?? m} ${v.toFixed(METRICS[m]?.decimals ?? 2)}${METRICS[m]?.unit === "s" ? "s" : ` ${METRICS[m]?.unit ?? ""}`}`;

export default async function College({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const c = me.college;

  if (!c) {
    return (
      <>
        <Title sub="For college coaches and staff. Families choose who can see their athlete. Verified results only.">College Coach Pass</Title>
        {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
        <p className="text-sm text-soft">Signed in as {me.email}. A school .edu email lets us match your school. Another email works too; it just takes a manual check.</p>
        <form action={applyCollege} className="flex flex-col gap-3">
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <label className="flex flex-col gap-1 text-sm font-semibold">School<input name="school" required minLength={2} maxLength={120} className={input} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">Level
              <select name="level" className={input}>{["NCAA D1", "NCAA D2", "NCAA D3", "NAIA", "JUCO", "Prep", "Other"].map((l) => <option key={l}>{l}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Sport<input name="sport" defaultValue="football" className={input} /></label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">Your title<input name="title" required minLength={2} maxLength={80} placeholder="Safeties coach" className={input} /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Link to your school&apos;s athletics staff page
            <input name="staff_url" type="url" placeholder="https://…" className={input} />
            <span className="text-xs font-normal text-muted">Required if your school isn&apos;t on ProLyt yet.</span></label>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="not_agent" required className="mt-0.5 size-5 accent-[var(--color-gold)]" />
            <span>I am not a sports agent, financial advisor, NIL representative, scout or recruiting-service employee, and I am not applying on behalf of one.</span></label>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="conduct" required className="mt-0.5 size-5 accent-[var(--color-gold)]" />
            <span>I will follow the code of conduct: no commercial solicitation, no outside-contact details, contact only through ProLyt after a family accepts, and no sharing my account.</span></label>
          <button className="min-h-12 rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold">Apply</button>
        </form>
      </>
    );
  }

  if (c.status !== "active" || c.schoolStatus !== "verified") {
    const msg = c.status === "frozen" || c.schoolStatus === "frozen" ? "Your access is paused. Contact ProLyt."
      : c.status === "removed" ? "Your access was removed. Contact ProLyt if this is a mistake."
      : c.role === "admin" || c.schoolStatus === "pending" ? `ProLyt is checking ${c.school}. This is a one-time check. You'll be able to sign in here as soon as it's done.`
      : `Your request is with the ${c.school} admin. They approve their own staff.`;
    return (<><Title>College Coach Pass</Title>{sp.ok ? <Notice tone="good">Application sent.</Notice> : null}<Notice>{msg}</Notice></>);
  }

  const place = sp.place?.trim().slice(0, 60) || null;
  const pos = POSITIONS.includes(sp.pos ?? "") ? sp.pos! : null;
  const grad = /^20\d\d$/.test(sp.grad ?? "") ? Number(sp.grad) : null;
  const metric = SEARCH_METRICS.includes(sp.metric ?? "") ? sp.metric! : null;
  const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
  const min = num(sp.min), max = num(sp.max);
  const page = Math.max(0, Math.min(200, Number(sp.page) || 0));
  const rows = await asUser(me.id, (q) => q<Row>("select * from college_search($1, $2, $3, $4, $5, $6, $7, $8)", [pos, grad, place, metric, min, max, PAGE + 1, page * PAGE]));
  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const year = new Date().getFullYear();
  const qs = (p: number) => new URLSearchParams(Object.entries({ pos: pos ?? "", grad: grad ? String(grad) : "", place: place ?? "", metric: metric ?? "", min: sp.min ?? "", max: sp.max ?? "", page: p ? String(p) : "" }).filter(([, v]) => v)).toString();

  return (
    <>
      <Title sub={`${c.school} · ${c.title}. These families chose to be seen.`}>Find athletes</Title>
      <form className="flex flex-col gap-2" role="search">
        <div className="grid grid-cols-2 gap-2">
          <select name="pos" defaultValue={pos ?? ""} aria-label="Position" className={input}><option value="">Any position</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
          <select name="grad" defaultValue={grad ?? ""} aria-label="Class of" className={input}><option value="">Any class</option>{Array.from({ length: 5 }, (_, i) => year + i).map((y) => <option key={y} value={y}>Class of {y}</option>)}</select>
        </div>
        <input name="place" defaultValue={place ?? ""} placeholder="Town or school (if shared)" aria-label="Town or school" className={input} />
        <div className="grid grid-cols-3 gap-2">
          <select name="metric" defaultValue={metric ?? ""} aria-label="Verified test" className={input}><option value="">Any test</option>{SEARCH_METRICS.map((m) => <option key={m} value={m}>{METRICS[m].short}</option>)}</select>
          <input name="min" inputMode="decimal" defaultValue={sp.min ?? ""} placeholder="at least" aria-label="At least" className={input} />
          <input name="max" inputMode="decimal" defaultValue={sp.max ?? ""} placeholder="at most" aria-label="At most" className={input} />
        </div>
        <button className="min-h-12 rounded-md bg-gold font-bold text-on-gold">Search</button>
        <p className="text-xs text-muted">Test filters only match athletes whose family chose to share verified results.</p>
      </form>
      {list.length === 0 ? <Notice>No athletes match. Families decide who can see them, so the list grows as more opt in.</Notice> : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.athlete_id}>
              <Link href={`/college/athlete/${a.athlete_id}`} className="block rounded-[14px] border border-line bg-panel p-3 hover:border-gold">
                <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{a.first_name} {a.last_name}</span>{a.watched ? <span className="text-xs text-gold">★ Watching</span> : null}</div>
                <div className="text-sm text-soft">{[a.pos, a.grad_year ? `Class of ${a.grad_year}` : null, a.hometown, a.school].filter(Boolean).join(" · ")}</div>
                {a.results?.length ? <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">{a.results.slice(0, 4).map((r) => <span key={r.metric}>{fmt(r.metric, Number(r.value))}</span>)}</div> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between text-sm font-semibold">
        {page > 0 ? <Link href={`/college?${qs(page - 1)}`} className="min-h-11 py-3">← Previous</Link> : <span />}
        {more ? <Link href={`/college?${qs(page + 1)}`} className="min-h-11 py-3 text-gold">Next →</Link> : null}
      </div>
      <Card className="text-xs text-muted">Verified results are from coach- and event-logged testing, never self-reported. Looking at a profile is recorded where the family can see it. Don&apos;t contact athletes or families outside ProLyt.</Card>
    </>
  );
}
