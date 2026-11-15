import type { Slot, Rarity } from "@/lib/binder";

const TINT: Record<Rarity, { bg: string; edge: string; label: string }> = {
  base: { bg: "linear-gradient(160deg,#3a3a3a,#161616)", edge: "#8a8a8a", label: "Base" },
  chrome: { bg: "linear-gradient(160deg,#cfd8e3,#4a5562 55%,#1b2027)", edge: "#cfd8e3", label: "Chrome" },
  gold: { bg: "linear-gradient(160deg,#fff1a8,#f8c40a 45%,#5a4300)", edge: "#f8c40a", label: "Gold" },
  black: { bg: "linear-gradient(160deg,#9a7bff,#2a2236 45%,#050505)", edge: "#b69cff", label: "Black" },
};

/** The set page: every card in Series 1, owned ones lit, the rest as silhouettes that say how to earn them. */
export function Binder({ slots, first }: { slots: Slot[]; first: string }) {
  const have = slots.filter((s) => s.owned).length;
  return (
    <section aria-label="Series 1 binder" className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">Series 1 binder</div>
          <div className="font-display text-[28px] leading-none">{have} <span className="text-[16px] text-muted">of {slots.length} earned</span></div>
        </div>
        {have === slots.length ? <span className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-gold">Set complete</span> : null}
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={slots.length} aria-valuenow={have} aria-label="Cards earned" className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-gold" style={{ width: `${(have / slots.length) * 100}%` }} />
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {slots.map((s) => {
          const t = TINT[s.rarity];
          return (
            <li key={s.no} data-owned={s.owned} className="relative flex flex-col justify-between overflow-hidden rounded-[10px] p-2"
              style={{ aspectRatio: "5 / 7", ...(s.owned ? { background: t.bg, border: `2px solid ${t.edge}`, boxShadow: s.rarity === "base" ? undefined : `0 0 14px ${t.edge}55` } : { border: "2px dashed #333", background: "#0d0d0d" }) }}>
              <span className="font-cond text-[11px] font-extrabold tracking-[1.5px]" style={{ color: s.owned ? (s.rarity === "gold" ? "#1a1300" : "#fff") : "#555" }}>
                {String(s.no).padStart(2, "0")}{s.owned ? ` · ${t.label.toUpperCase()}` : ""}
              </span>
              {s.owned ? (
                <span className="font-display text-[19px] uppercase leading-[1.05]" style={{ color: s.rarity === "gold" ? "#1a1300" : "#fff" }}>{s.title}</span>
              ) : (
                <>
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" className="self-center"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                  <span className="text-[10.5px] leading-tight text-muted"><span className="sr-only">{s.title}: </span>{s.hint}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {have < slots.length ? <p className="text-[12px] text-muted">{first} earns each card with real results. Nothing here can be bought.</p> : null}
    </section>
  );
}
