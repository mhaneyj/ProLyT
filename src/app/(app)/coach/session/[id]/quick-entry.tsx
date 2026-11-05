"use client";
import { useActionState } from "react";
import { saveBatch, type BatchState } from "./actions";

export function QuickEntry({ session, metric, unit, athletes }: {
  session: string; metric: string; unit: string; athletes: { id: string; name: string; best: string | null }[];
}) {
  const [state, action, pending] = useActionState<BatchState, FormData>(saveBatch, {});
  return (
    <form action={action} key={`${metric}-${state.ok ?? ""}`} className="flex flex-col gap-2">
      <input type="hidden" name="session" value={session} />
      <input type="hidden" name="metric" value={metric} />
      {athletes.map((a) => {
        const bad = state.bad?.[a.id];
        return (
          <div key={a.id} className={`flex items-center gap-3 rounded-[10px] border px-3.5 py-2 ${bad ? "border-bad" : "border-line"} bg-panel`}>
            <label htmlFor={`q-${a.id}`} className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{a.name}</span>
              <span className={`text-xs ${bad ? "text-bad" : "text-muted"}`}>{bad ?? (a.best ? `Best: ${a.best}` : "No result yet")}</span>
            </label>
            <input id={`q-${a.id}`} name={`v:${a.id}`} inputMode="decimal" enterKeyHint="next" autoComplete="off" placeholder="—"
              defaultValue={state.values?.[a.id]} aria-invalid={bad ? true : undefined}
              className="tabular min-h-12 w-24 rounded-md border border-[#333] bg-[#111] px-3 text-right font-display text-xl text-cream" />
            <span className="w-6 text-xs text-muted">{unit}</span>
          </div>
        );
      })}
      {state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm">{state.error}</div> : null}
      {state.ok ? <div role="status" className="rounded-lg border border-good p-3 text-sm text-good">{state.ok}</div> : null}
      <button disabled={pending} className="min-h-14 w-full rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {pending ? "Saving…" : "Save results"}
      </button>
    </form>
  );
}
