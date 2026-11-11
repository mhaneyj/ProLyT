import type { CSSProperties } from "react";

// The ProLyt Player Card. One layout, several finishes:
//   player    — the athlete's own rating card (black and gold; "In The Trenches" edition for linemen)
//   attendee  — an event's card, in the host's colors
//   champion  — gold foil, for the winning team
//   mvp       — holographic, named by the host
// Pure markup and CSS so it renders on the server and in the share image the same way.

export type CardTier = "player" | "attendee" | "champion" | "mvp";

export type CardProps = {
  first: string;
  last: string;
  position: string | null;
  grad: number | null;
  photo: string | null;
  ovr: number | null;
  /** Attribute chips. null = locked (shown as a teaser). */
  attrs: { short: string; value: number | null }[] | null;
  tier: CardTier;
  color?: string;     // series base color
  accent?: string;    // series accent
  series: string;     // "ProLyt" or the event series name
  footer?: string;    // event name and date, or "Class of 2029"
  sponsor?: string | null;
  trench?: boolean;
  foil?: boolean;     // ProLyt+ finish on the player card
  size?: "lg" | "sm";
  team?: string | null;
};

const TIER_LABEL: Record<CardTier, string | null> = { player: null, attendee: null, champion: "Champion", mvp: "MVP" };

export function PlayerCard(p: CardProps) {
  const lg = (p.size ?? "lg") === "lg";
  const base = p.tier === "player" ? (p.trench ? "#16181b" : "#0b0b0b") : (p.color ?? "#0b0b0b");
  const accent = p.tier === "champion" ? "#f8c40a" : p.accent ?? "#f8c40a";
  const finish = p.tier === "mvp" ? "holo" : p.tier === "champion" || p.foil ? "gold" : null;
  const vars = { "--card-base": base, "--card-accent": accent } as CSSProperties;
  const badge = TIER_LABEL[p.tier];
  const initials = `${p.first[0] ?? ""}${p.last[0] ?? ""}`.toUpperCase();

  return (
    <div style={vars} className={`player-card relative isolate select-none overflow-hidden ${lg ? "w-full max-w-[340px] rounded-[22px]" : "w-full rounded-[14px]"} aspect-[5/7] text-cream shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]`}
      role="img" aria-label={`${p.first} ${p.last} ${p.series} card${p.ovr ? `, overall ${p.ovr}` : ""}${badge ? `, ${badge}` : ""}`}>
      {/* Base: series color, a lit corner and diagonal texture */}
      <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(120% 80% at 85% 0%, color-mix(in srgb, var(--card-accent) 38%, transparent), transparent 60%), linear-gradient(160deg, color-mix(in srgb, var(--card-base) 85%, white 8%), var(--card-base) 55%, color-mix(in srgb, var(--card-base) 80%, black))` }} />
      <div className={`absolute inset-0 -z-10 ${p.trench && p.tier === "player" ? "opacity-40" : "opacity-[0.12]"}`}
        style={{ backgroundImage: `repeating-linear-gradient(${p.trench && p.tier === "player" ? "45deg" : "115deg"}, rgba(255,255,255,0.5) 0 1px, transparent 1px ${p.trench && p.tier === "player" ? "7px" : "12px"})` }} />
      {finish ? <div className={`card-${finish} pointer-events-none absolute inset-0 z-20`} /> : null}
      {/* Inner frame */}
      <div className={`pointer-events-none absolute z-10 border ${lg ? "inset-[10px] rounded-[16px]" : "inset-[6px] rounded-[10px]"}`} style={{ borderColor: "color-mix(in srgb, var(--card-accent) 70%, transparent)" }} />

      {/* Photo */}
      <div className="absolute inset-x-0 top-[12%] bottom-[30%] flex items-end justify-center">
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt="" className="h-full w-[78%] rounded-t-[999px] object-cover object-top" style={{ maskImage: "linear-gradient(to bottom, black 70%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)" }} />
        ) : (
          <div className={`grid aspect-square h-[80%] place-items-center rounded-full font-display ${lg ? "text-[72px]" : "text-[34px]"}`}
            style={{ background: "color-mix(in srgb, var(--card-accent) 18%, transparent)", color: "var(--card-accent)" }}>{initials}</div>
        )}
      </div>

      {/* Top-left: rating and position */}
      <div className={`absolute z-10 flex flex-col items-center leading-none ${lg ? "left-[22px] top-[20px]" : "left-[12px] top-[11px]"}`}>
        <span className={`font-display ${lg ? "text-[58px]" : "text-[28px]"}`} style={{ color: "var(--card-accent)" }}>{p.ovr ?? "--"}</span>
        <span className={`font-cond font-extrabold uppercase ${lg ? "mt-0.5 text-[17px] tracking-[2px]" : "text-[10px] tracking-[1px]"}`}>{(p.position ?? "ATH").split(/[\/,]/)[0].trim().slice(0, 4)}</span>
      </div>
      {/* Top-right: series mark and tier */}
      <div className={`absolute z-10 flex ${lg ? "max-w-[55%]" : "max-w-[48%]"} flex-col items-end text-right leading-tight ${lg ? "right-[22px] top-[22px]" : "right-[11px] top-[12px]"}`}>
        <span className={`font-cond font-extrabold uppercase ${lg ? "text-[13px] tracking-[2px]" : "max-w-full truncate text-[7px] tracking-[0.5px]"}`} style={{ color: "var(--card-accent)" }}>{p.series}</span>
        {p.trench && p.tier === "player" ? <span className={`font-cond font-extrabold uppercase text-cream/80 ${lg ? "text-[11px] tracking-[2px]" : "text-[7px]"}`}>In The Trenches</span> : null}
        {badge && lg ? <span className={`mt-1 rounded-full font-cond font-extrabold uppercase text-on-gold ${lg ? "px-2.5 py-0.5 text-[12px] tracking-[2px]" : "px-1.5 text-[8px] tracking-[1px]"}`} style={{ background: "var(--card-accent)" }}>{p.tier === "champion" ? "🏆 " : "★ "}{badge}</span> : null}
      </div>

      {/* Name plate and attributes */}
      <div className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-center ${lg ? "px-5 pb-[22px]" : "px-2 pb-[10px]"}`}>
        <div className={`w-full text-center font-display uppercase leading-[0.95] ${lg ? "text-[30px]" : "text-[14px]"}`}>
          <span className={`block font-cond font-extrabold tracking-[2px] text-cream/75 ${lg ? "text-[14px]" : "text-[8px]"}`}>{p.first}</span>
          <span className="block truncate">{p.last}</span>
        </div>
        <div className={`my-2 h-px w-[70%] ${lg ? "" : "my-1"}`} style={{ background: "color-mix(in srgb, var(--card-accent) 60%, transparent)" }} />
        {lg ? (
          p.attrs ? (
            <div className="grid w-full grid-cols-6 gap-1 text-center">
              {p.attrs.map((a) => (
                <span key={a.short} className="flex flex-col leading-none">
                  <span className="font-display text-[20px]">{a.value ?? "–"}</span>
                  <span className="mt-0.5 font-cond text-[10px] font-extrabold tracking-[1px] text-cream/70">{a.short}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex w-full items-center justify-center gap-2 font-cond text-[12px] font-extrabold uppercase tracking-[2px] text-cream/70">
              <span aria-hidden="true">🔒</span> Attributes locked
            </div>
          )
        ) : null}
        <div className={`mt-2 flex w-full items-center justify-between font-cond font-bold uppercase text-cream/70 ${lg ? "text-[11px] tracking-[1.5px]" : "mt-1 text-[7px] tracking-[0.5px]"}`}>
          <span className="truncate">{p.footer ?? (p.grad ? `Class of ${p.grad}` : "")}</span>
          {lg ? <span className="flex-none">{p.sponsor ? `Presented by ${p.sponsor}` : "ProLyt"}</span> : null}
        </div>
      </div>
    </div>
  );
}
