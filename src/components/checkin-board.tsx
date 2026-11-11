"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export type BoardRow = { pass_code: string; name: string; team: string; division: string; problems: string[]; checked_in_at: string | null };

/** Everyone on every roster. Search by name or team when someone forgot their phone. */
export function CheckinBoard({ rows }: { rows: BoardRow[] }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"waiting" | "in" | "all">("waiting");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (show === "all" || (show === "in") === Boolean(r.checked_in_at)) && (!s || `${r.name} ${r.team}`.toLowerCase().includes(s)));
  }, [rows, q, show]);
  const tab = (k: typeof show, label: string) => (
    <button type="button" onClick={() => setShow(k)} aria-pressed={show === k}
      className={`min-h-10 flex-1 rounded-full text-sm font-bold ${show === k ? "bg-gold text-on-gold" : "text-soft"}`}>{label}</button>
  );
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="board-search" className="sr-only">Find an athlete</label>
      <input id="board-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name or team" autoComplete="off"
        className="min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
      <div className="flex gap-1 rounded-full border border-line p-1">{tab("waiting", "Not in yet")}{tab("in", "Checked in")}{tab("all", "All")}</div>
      {list.slice(0, 200).map((r) => (
        <Link key={r.pass_code} href={`/checkin/${r.pass_code}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 hover:border-gold">
          <span className="min-w-0"><span className="block truncate font-semibold">{r.name}</span><span className="block truncate text-[12px] text-muted">{r.team} · {r.division}</span></span>
          <span className="flex-none text-[12px]">{r.checked_in_at ? <span className="text-good">✓ In</span> : r.problems.length ? <span className="text-bad">{r.problems.length} to fix</span> : <span className="text-gold">Check in →</span>}</span>
        </Link>
      ))}
      {list.length === 0 ? <p className="py-4 text-center text-sm text-muted">No one here.</p> : null}
    </div>
  );
}
