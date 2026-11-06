import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Empty, Title } from "@/components/ui";
import { setFollow } from "../feed/actions";

export const metadata = { title: "Find athletes" };

type A = { id: string; name: string; line: string; hometown: string | null; has_photo: boolean; followers: number; following: boolean; programs: string | null };
const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K"];

export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string; pos?: string; grad?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const q = sp.q?.trim().slice(0, 60) || null;
  const pos = POSITIONS.includes(sp.pos ?? "") ? sp.pos! : null;
  const grad = /^20\d\d$/.test(sp.grad ?? "") ? Number(sp.grad) : null;
  const rows = await asUser(me.id, (x) => x<A>("select * from discover_athletes($1, $2, $3)", [q, pos, grad]));
  const year = new Date().getFullYear();
  const qs = new URLSearchParams(Object.entries({ q: q ?? "", pos: pos ?? "", grad: grad ? String(grad) : "" }).filter(([, v]) => v)).toString();
  const back = `/discover${qs ? `?${qs}` : ""}`;
  const sel = "min-h-11 rounded-md border border-line bg-panel px-2 text-sm text-cream";
  return (
    <>
      <Title sub="Athletes on ProLyt. Under-13s are never listed; 13–17 only with a parent's OK.">Find athletes</Title>
      <form className="flex flex-col gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name, school or town" className="min-h-12 rounded-md border border-line bg-panel px-3 text-[16px]" />
        <div className="flex gap-2">
          <select name="pos" defaultValue={pos ?? ""} aria-label="Position" className={`${sel} flex-1`}>
            <option value="">Any position</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select name="grad" defaultValue={grad ?? ""} aria-label="Class of" className={`${sel} flex-1`}>
            <option value="">Any class</option>{Array.from({ length: 8 }, (_, i) => year + i).map((y) => <option key={y} value={y}>Class of {y}</option>)}
          </select>
          <button className="min-h-11 rounded-md bg-gold px-4 font-bold text-on-gold">Go</button>
        </div>
      </form>
      {rows.length === 0 ? <Empty title="No athletes found">Try a wider search.</Empty> : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
              <Link href={`/a/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid size-12 flex-none place-items-center overflow-hidden rounded-full bg-[#1c1c1c] font-cond text-[16px] font-extrabold text-gold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.has_photo ? <img src={`/api/photo/${a.id}`} alt="" className="size-full object-cover" /> : a.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block truncate text-[12px] text-muted">{a.line || a.programs || "Athlete"}</span>
                  <span className="block text-[11px] text-muted">{a.followers} follower{a.followers === 1 ? "" : "s"}{a.hometown ? ` · ${a.hometown}` : ""}</span>
                </span>
              </Link>
              <form action={setFollow}>
                <input type="hidden" name="athlete" value={a.id} /><input type="hidden" name="on" value={a.following ? "0" : "1"} /><input type="hidden" name="back" value={back} />
                <button className={`min-h-10 rounded-full px-4 text-sm font-bold ${a.following ? "border border-line text-soft" : "bg-gold text-on-gold"}`}>{a.following ? "Following" : "Follow"}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
