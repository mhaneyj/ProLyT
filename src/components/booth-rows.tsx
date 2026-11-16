"use client";
import { useState, useTransition } from "react";
import { saveBoothResult, voidBoothResult } from "@/app/(app)/day/booth-actions";
import { BOOTH_METHODS, type BoothMethod } from "@/lib/booth";

export type BoothEntry = { id: string; text: string };
export type BoothRow = { code: string; name: string; team: string; hasPhoto: boolean; entries: BoothEntry[] };

// One line per checked-in athlete: type the result, hit Save (or Enter), done. Each save is its own record; the best counts.
export function BoothRows({ eventId, metric, hint, rows: initial }: { eventId: string; metric: string; hint: string; rows: BoothRow[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<BoothMethod>("hand");
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const patch = (code: string, fn: (r: BoothRow) => BoothRow) => setRows((rs) => rs.map((r) => (r.code === code ? fn(r) : r)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Find an athlete" aria-label="Find an athlete" className="min-h-12 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
        <select value={method} onChange={(e) => setMethod(e.target.value as BoothMethod)} aria-label="How it was timed" className="min-h-12 rounded-md border border-[#333] bg-[#111] px-2 text-sm">
          {BOOTH_METHODS.map((m) => <option key={m} value={m}>{m === "hand" ? "Hand timed" : m === "electronic" ? "Electronic" : "Laser"}</option>)}
        </select>
      </div>
      {shown.length === 0 ? <p className="rounded-[14px] border border-dashed border-line p-3.5 text-sm text-muted">{rows.length ? "No one by that name." : "No one is checked in yet. Scan passes at check-in first."}</p> : null}
      {shown.map((r) => <Row key={r.code} r={r} eventId={eventId} metric={metric} hint={hint} method={method} patch={patch} />)}
    </div>
  );
}

function Row({ r, eventId, metric, hint, method, patch }: { r: BoothRow; eventId: string; metric: string; hint: string; method: BoothMethod; patch: (code: string, fn: (r: BoothRow) => BoothRow) => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = () => {
    if (!val.trim()) return;
    setErr(null);
    start(async () => {
      const res = await saveBoothResult(eventId, r.code, metric, val, method);
      if (res.error || !res.id) { setErr(res.error ?? "Didn't save"); return; }
      patch(r.code, (x) => ({ ...x, entries: [...x.entries, { id: res.id!, text: res.text! }] }));
      setVal("");
    });
  };
  const undo = () => {
    const last = r.entries[r.entries.length - 1];
    if (!last) return;
    start(async () => {
      const res = await voidBoothResult(eventId, last.id);
      if (res.error) { setErr(res.error); return; }
      patch(r.code, (x) => ({ ...x, entries: x.entries.slice(0, -1) }));
    });
  };
  return (
    <div className={`flex flex-col gap-2 rounded-[14px] border p-3 ${r.entries.length ? "border-good/60 bg-good/5" : "border-line bg-panel"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{r.name}{r.entries.length ? <span className="ml-1.5 text-good" aria-label="tested">✓</span> : null}</div>
          <div className="truncate text-[12px] text-muted">{r.team}{r.hasPhoto ? "" : " · no photo yet"}</div>
        </div>
        {r.entries.length ? (
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <span className="font-display text-lg">{r.entries.map((e) => e.text).join(" · ")}</span>
            <button type="button" onClick={undo} disabled={busy} className="min-h-11 px-2 text-[13px] text-muted underline">Undo</button>
          </div>
        ) : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} inputMode={metric === "broad" ? "text" : "decimal"} placeholder={hint} aria-label={`${r.name} result`} enterKeyHint="done"
          className="min-h-12 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-lg text-cream" />
        <button disabled={busy || !val.trim()} className="min-h-12 rounded-md bg-gold px-5 font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold disabled:opacity-50">{busy ? "…" : "Save"}</button>
      </form>
      {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
    </div>
  );
}
