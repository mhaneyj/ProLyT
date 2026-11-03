"use client";
import { useActionState, useRef, useEffect } from "react";
import { logResult, type ActionState } from "./actions";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";

export function LogForm({ session, athletes, metrics }: { session: string; athletes: { id: string; name: string }[]; metrics: { key: string; label: string; unit: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logResult, {});
  const valueRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if ((state.ok || state.error) && valueRef.current) valueRef.current.focus();
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="session" value={session} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="athlete" className="mb-1.5 block text-sm text-soft">Athlete</label>
          <select id="athlete" name="athlete" defaultValue={state.values?.athlete} className={input}>
            {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="metric" className="mb-1.5 block text-sm text-soft">Test</label>
          <select id="metric" name="metric" defaultValue={state.values?.metric} className={input}>
            {metrics.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="value" className="mb-1.5 block text-sm text-soft">Result</label>
          <input ref={valueRef} id="value" name="value" defaultValue={state.values?.value} inputMode="decimal" autoComplete="off" className={`${input} tabular text-lg`} />
        </div>
        <button disabled={pending} className="mt-[26px] min-h-12 rounded-md bg-gold px-6 font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-ink disabled:opacity-60">
          {pending ? "…" : "Save"}
        </button>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">
        {state.error ? <span className="text-bad">{state.error}</span> : state.ok ? <span className="text-good">✓ {state.ok}</span> : null}
      </div>
    </form>
  );
}
