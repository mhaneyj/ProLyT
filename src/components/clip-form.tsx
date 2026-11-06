import { addClip } from "@/app/(app)/athlete/[id]/actions";

const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";

/** "Mark a clip": a time range in a film, tagged to one athlete. */
export function ClipForm({ film, back, athlete, athletes }: { film: string; back: string; athlete?: string; athletes?: { id: string; name: string }[] }) {
  return (
    <details className="group rounded-lg border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-semibold text-gold">✂ Mark a clip</summary>
      <form action={addClip} className="flex flex-col gap-2 px-3 pb-3">
        <input type="hidden" name="film" value={film} /><input type="hidden" name="back" value={back} />
        {athlete ? <input type="hidden" name="athlete" value={athlete} /> : (
          <label className="text-xs text-soft">Athlete
            <select name="athlete" required className={`${input} mt-1`}>
              <option value="">Pick an athlete…</option>
              {athletes?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-soft">Start<input name="start" required inputMode="numeric" placeholder="1:02" className={`${input} mt-1 tabular`} /></label>
          <label className="text-xs text-soft">End<input name="end" required inputMode="numeric" placeholder="1:15" className={`${input} mt-1 tabular`} /></label>
        </div>
        <label className="text-xs text-soft">What happened<input name="title" required maxLength={80} placeholder="TD catch, 3rd & 7" className={`${input} mt-1`} /></label>
        <label className="flex items-center gap-2 text-sm text-soft"><input type="checkbox" name="highlight" className="size-5 accent-[var(--color-gold)]" /> Add to highlights</label>
        <button className="min-h-11 rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[2px] text-on-gold">Save clip</button>
      </form>
    </details>
  );
}
