import { Card, Empty, Notice, Pill } from "@/components/ui";
import { decideAgeCheck } from "@/lib/age-review";

export type QueueRow = { id: string; athlete_id: string; name: string; purpose: "age" | "grade"; doc_kind: string; submitted_at: string;
  profile_birth: string | null; profile_grad: number | null; team: string | null; division: string | null; has_doc: boolean };

const KIND: Record<string, string> = { birth_certificate: "Birth certificate", passport: "Passport", state_id: "State ID", school_record: "School record", report_card: "Report card" };

/** Grade this school year for a graduation year (school year flips Aug 1). */
function gradeFor(grad: number | null) {
  if (!grad) return "";
  const now = new Date(); const sy = now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0);
  const g = 12 - (grad - sy);
  return g >= 0 && g <= 12 ? String(g) : "";
}

export function AgeReviewList({ rows, back, sp }: { rows: QueueRow[]; back: string; sp: { error?: string; done?: string } }) {
  const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-2.5 text-[15px] text-cream";
  return (
    <>
      {sp.done ? <Notice tone="good">{sp.done === "approved" ? "Verified. The document is deleted." : "Sent back to the family. The document is deleted."}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <p className="text-[12px] leading-relaxed text-muted">Check that the name matches and read the date off the document. Approving deletes the document and keeps only the verified date. Every view is logged.</p>
      {rows.length === 0 ? <Empty title="Nothing to review">Documents families upload for this event show up here.</Empty> : null}
      {rows.map((r) => (
        <Card key={r.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{r.name}</div>
              <div className="text-[12px] text-muted">{[r.team, r.division].filter(Boolean).join(" · ") || "Not on a roster yet"}</div>
            </div>
            <Pill tone="warn">{r.purpose === "age" ? "Age" : "Grade"} · {KIND[r.doc_kind] ?? r.doc_kind}</Pill>
          </div>
          {r.has_doc ? (
            <a href={`/api/verify/doc/${r.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-line bg-black">
              <object data={`/api/verify/doc/${r.id}`} aria-label={`${r.name}'s document`} className="h-72 w-full object-contain" />
              <span className="block px-3 py-2 text-center text-[12px] text-gold">Open full size</span>
            </a>
          ) : <p className="text-sm text-muted">Document missing. Reject and ask for a new upload.</p>}
          <form action={decideAgeCheck} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="approve" value="1" />
            {r.purpose === "age" ? (
              <label className="text-xs text-soft">Birth date on the document
                <input name="birth" type="date" required defaultValue={r.profile_birth ?? ""} className={`${input} mt-1`} /></label>
            ) : (
              <label className="text-xs text-soft">Grade on the report card (this school year)
                <input name="grade" inputMode="numeric" required defaultValue={gradeFor(r.profile_grad)} className={`${input} mt-1`} /></label>
            )}
            <button className="min-h-12 rounded-md bg-good font-bold text-ink">Approve</button>
          </form>
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-bad">Can&apos;t verify…</summary>
            <form action={decideAgeCheck} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="approve" value="0" />
              <label className="text-xs text-soft">Tell the family why
                <input name="note" required minLength={3} maxLength={500} placeholder="Blurry photo, name doesn't match…" className={`${input} mt-1`} /></label>
              <button className="min-h-11 rounded-md border border-bad font-semibold text-bad">Send back</button>
            </form>
          </details>
        </Card>
      ))}
    </>
  );
}
