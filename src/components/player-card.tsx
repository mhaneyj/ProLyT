import type { CSSProperties, ReactNode } from "react";

// ProLyt Series 1 cards. Two looks:
//   Chrome  — player (silver base), champion (gold), mvp (black chrome)
//   Modern  — signed (autograph), attendee (event card, in the host's colors)
// Every size is in container units, so the same card renders as a thumbnail or full size.

export type CardTier = "player" | "attendee" | "champion" | "mvp" | "signed";

export type CardProps = {
  first: string;
  last: string;
  position: string | null;
  grad: number | null;
  photo: string | null;
  ovr: number | null;
  /** Attribute chips (shown on the back). null = locked. */
  attrs: { short: string; value: number | null }[] | null;
  tier: CardTier;
  color?: string;          // event series color
  accent?: string;         // event series accent
  series: string;          // "ProLyt" or the event series name
  footer?: string;         // event date or tagline
  sponsor?: string | null;
  trench?: boolean;
  foil?: boolean;          // ProLyt+ shine on the player card
  size?: "lg" | "sm";
  team?: string | null;
  number?: string | null;
  autograph?: string | null;   // SVG path, 600×200 box
  inscription?: string | null; // handwritten line under the autograph
  serial?: string | null;      // "07/25"
  firstCard?: boolean;
};

/** Design pixels (the card is designed 750 wide) to container units. */
const u = (n: number) => `${(n / 7.5).toFixed(3)}cqw`;

const CHROME = {
  player: {
    frame: "linear-gradient(135deg, #f8f8fb, #8d93a1 18%, #ffffff 32%, #6f7584 48%, #e9ebf1 62%, #9aa0ad 78%, #ffffff)",
    line: "linear-gradient(90deg, #ff2fa0, #35d4ff, #ffe14a, #39ff9f, #ff2fa0)",
    glow: "radial-gradient(60% 45% at 55% 32%, rgba(120,200,255,0.45), rgba(255,60,180,0.2) 45%, transparent 75%)",
    refr: "linear-gradient(120deg, transparent 10%, rgba(255,0,170,0.28) 22%, rgba(0,220,255,0.28) 30%, rgba(255,240,0,0.22) 38%, transparent 50%, rgba(0,255,170,0.2) 62%, rgba(255,0,170,0.24) 72%, transparent 84%)",
    ink: "linear-gradient(180deg, #ffffff 0%, #c7ccd6 45%, #7b8191 52%, #f3f5f9 70%, #aeb3bf 100%)",
    halo: "rgba(80,200,255,0.5)",
    tag: "linear-gradient(90deg, #ff2fa0, #35d4ff)",
  },
  champion: {
    frame: "linear-gradient(135deg, #fff3c4, #9b7414 18%, #ffe596 32%, #7a5a0e 48%, #f8d35a 62%, #a87d16 78%, #fff0b0)",
    line: "linear-gradient(90deg, #fff0b0, #f8c40a, #fff0b0)",
    glow: "radial-gradient(60% 45% at 55% 32%, rgba(255,200,80,0.5), rgba(255,120,40,0.2) 45%, transparent 75%)",
    refr: "linear-gradient(120deg, transparent 12%, rgba(255,210,90,0.35) 26%, rgba(255,255,255,0.25) 33%, transparent 46%, rgba(255,180,40,0.25) 64%, transparent 80%)",
    ink: "linear-gradient(180deg, #fff6cf 0%, #f8d35a 45%, #8a6a12 52%, #ffe596 70%, #c9971f 100%)",
    halo: "rgba(255,190,60,0.55)",
    tag: "linear-gradient(90deg, #f8d35a, #fff0b0, #f8c40a)",
  },
  mvp: {
    frame: "linear-gradient(135deg, #3a3d45, #0a0a0c 18%, #8a8f9b 30%, #0a0a0c 46%, #5d616c 62%, #0a0a0c 78%, #a7acb8)",
    line: "linear-gradient(90deg, #ff2fa0, #b28dff, #35d4ff, #feff9c, #ff2fa0)",
    glow: "radial-gradient(55% 40% at 55% 32%, rgba(178,141,255,0.4), rgba(255,47,160,0.18) 45%, transparent 75%)",
    refr: "linear-gradient(120deg, transparent 15%, rgba(255,110,199,0.25) 26%, rgba(122,252,255,0.25) 34%, rgba(254,255,156,0.2) 42%, transparent 54%)",
    ink: "linear-gradient(180deg, #ffffff 0%, #c7ccd6 45%, #7b8191 52%, #f3f5f9 70%, #aeb3bf 100%)",
    halo: "rgba(178,141,255,0.6)",
    tag: "linear-gradient(90deg, #ff6ec7, #b28dff, #7afcff)",
  },
} as const;

const posShort = (p: string | null) => (p ?? "ATH").split(/[\/,]/)[0].trim().toUpperCase().slice(0, 4);
const textFill = (bg: string): CSSProperties => ({ backgroundImage: bg, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" });

function Photo({ src, initials, tint }: { src: string | null; initials: string; tint: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />;
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: `radial-gradient(circle at 50% 35%, ${tint}, #07080d 70%)` }}>
      <span className="font-display" style={{ fontSize: u(260), color: "rgba(255,255,255,0.18)" }}>{initials}</span>
    </div>
  );
}

/** The athlete's signature, drawn from the stored strokes. */
export function Autograph({ path, color = "#ffffff", className = "", style }: { path: string; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 600 200" className={className} style={style} aria-hidden="true">
      <path d={path} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" transform="translate(2 3)" />
      <path d={path} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shell({ children, label, lg, radius = 30 }: { children: ReactNode; label: string; lg: boolean; radius?: number }) {
  return (
    <div className={`${lg ? "w-full max-w-[360px]" : "w-full"} [container-type:inline-size]`}>
      <div role="img" aria-label={label} className="player-card relative aspect-[5/7] w-full select-none overflow-hidden text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
        style={{ borderRadius: u(radius) }}>{children}</div>
    </div>
  );
}

function ChromeCard(p: CardProps & { kind: "player" | "champion" | "mvp" }) {
  const c = CHROME[p.kind];
  const initials = `${p.first[0] ?? ""}${p.last[0] ?? ""}`.toUpperCase();
  const set = p.kind === "mvp" ? "BLACK CHROME" : p.kind === "champion" ? p.series.toUpperCase() : p.trench ? "IN THE TRENCHES" : "PROLYT · CHROME";
  return (
    <Shell lg={(p.size ?? "lg") === "lg"} label={`${p.first} ${p.last} ${p.kind === "player" ? "Chrome" : p.kind === "champion" ? "Champion" : "MVP"} card${p.ovr ? `, overall ${p.ovr}` : ""}`}>
      <div className="absolute inset-0" style={{ background: c.frame, padding: u(26) }}>
        <div className="h-full w-full" style={{ background: c.line, padding: u(3), borderRadius: u(10) }}>
          <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: u(8), background: p.kind === "mvp" ? "#000" : "#07080d" }}>
            <Photo src={p.photo} initials={initials} tint={p.kind === "champion" ? "#6b4d0c" : "#1d2a4a"} />
            <div className="absolute inset-0" style={{ background: "repeating-conic-gradient(from 0deg at 50% 38%, rgba(255,255,255,0.08) 0 4deg, transparent 4deg 12deg)", mixBlendMode: "screen" }} />
            <div className="absolute inset-0" style={{ background: c.glow, mixBlendMode: "screen" }} />
            <div className={`absolute inset-0 ${p.foil || p.kind !== "player" ? "card-sheen" : ""}`} style={{ background: c.refr, mixBlendMode: "screen" }} />
            <div className="absolute inset-x-0 bottom-0" style={{ height: u(400), background: "linear-gradient(180deg, rgba(7,8,13,0), rgba(7,8,13,0.94) 68%)" }} />

            {p.kind === "champion" ? <div className="absolute font-display" style={{ left: u(30), top: u(30), padding: `${u(6)} ${u(16)}`, background: c.tag, color: "#07080d", fontSize: u(34), letterSpacing: u(3), transform: "skewX(-10deg)" }}>CHAMPIONS</div> : null}
            {p.kind === "mvp" ? <div className="absolute font-display leading-none" style={{ left: u(28), top: u(16), fontSize: u(120), letterSpacing: u(2), ...textFill("linear-gradient(115deg, #ff6ec7, #7afcff 35%, #feff9c 55%, #b28dff 80%)"), filter: "drop-shadow(0 2px 0 #000)" }}>MVP</div> : null}
            <div className="absolute text-right font-cond font-extrabold" style={{ right: u(32), top: u(30), fontSize: u(24), letterSpacing: u(7), lineHeight: 1.15, maxWidth: u(380) }}>
              {set}
              {p.firstCard && p.kind === "player" ? <div style={{ fontSize: u(19), letterSpacing: u(6), color: "#ffe14a" }}>1ST CARD</div> : null}
              {p.kind === "champion" && p.footer ? <div style={{ fontSize: u(19), letterSpacing: u(5), color: "#fff0b0" }}>{p.footer.toUpperCase()}</div> : null}
            </div>

            <div className="absolute" style={{ left: u(30), right: u(30), bottom: u(34) }}>
              <div className="font-cond font-extrabold" style={{ fontSize: u(38), letterSpacing: u(11), color: "#dfe6f3" }}>{p.first.toUpperCase()}</div>
              <div className="truncate font-display" style={{ fontSize: u(p.last.length > 9 ? 100 : 124), lineHeight: 0.92, letterSpacing: u(2), ...textFill(c.ink), filter: `drop-shadow(0 ${u(4)} 0 #000) drop-shadow(0 0 ${u(16)} ${c.halo})` }}>{p.last.toUpperCase()}</div>
              <div className="flex items-end justify-between">
                <span className="font-cond font-extrabold" style={{ marginTop: u(8), padding: `${u(5)} ${u(14)}`, background: c.tag, fontSize: u(28), letterSpacing: u(5), color: "#07080d" }}>
                  {p.kind === "mvp" ? "TOURNAMENT MVP" : `${posShort(p.position)}${p.team ? ` · ${p.team.toUpperCase()}` : ""}`}
                </span>
                <span className="flex flex-col items-end leading-none">
                  <span className="font-display" style={{ fontSize: u(64), ...textFill(c.tag) }}>{p.serial ?? p.ovr ?? "--"}</span>
                  <span className="font-cond font-extrabold" style={{ fontSize: u(16), letterSpacing: u(5), color: "#dfe6f3" }}>{p.serial ? "NUMBERED" : "OVR"}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ModernCard(p: CardProps & { kind: "signed" | "attendee" }) {
  const initials = `${p.first[0] ?? ""}${p.last[0] ?? ""}`.toUpperCase();
  const host = p.color ?? "#0d2b52", accent = p.accent ?? "#f8c40a";
  return (
    <Shell lg={(p.size ?? "lg") === "lg"} label={`${p.first} ${p.last} ${p.kind === "signed" ? "Signed" : `${p.series} event`} card`}>
      <div className="absolute inset-0 bg-[#0b0b0b]">
        <Photo src={p.photo} initials={initials} tint={p.kind === "attendee" ? host : "#2a2f3a"} />
        {p.number ? <div className="absolute font-sans font-extrabold leading-[0.8]" style={{ right: u(40), top: u(p.kind === "attendee" ? 130 : 70), fontSize: u(300), letterSpacing: u(-14), color: "transparent", WebkitTextStroke: `${u(2)} rgba(255,255,255,0.55)` }}>{p.number.padStart(2, "0")}</div> : null}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.88) 88%)" }} />
        {p.kind === "attendee" ? (
          <div className="absolute flex items-center justify-between" style={{ left: u(24), right: u(24), top: u(24), height: u(92), padding: `0 ${u(30)}`, background: host, borderRadius: `${u(12)} ${u(12)} 0 0` }}>
            <span className="truncate font-sans font-extrabold" style={{ fontSize: u(30), letterSpacing: u(2) }}>{p.series.toUpperCase()}</span>
            <span className="flex-none font-sans font-extrabold" style={{ fontSize: u(18), letterSpacing: u(4), color: accent }}>{(p.footer ?? "").toUpperCase()}</span>
          </div>
        ) : (
          <div className="absolute font-sans font-extrabold" style={{ left: u(56), top: u(56), fontSize: u(22), letterSpacing: u(8) }}>PROLYT — SIGNED</div>
        )}
        <div className="absolute" style={{ inset: u(24), border: `${u(2)} solid rgba(255,255,255,0.75)`, borderRadius: u(12) }} />
        {p.autograph ? (
          <div className="absolute flex flex-col items-end" style={{ right: u(40), bottom: u(200), width: u(440), transform: "rotate(-7deg)" }}>
            <Autograph path={p.autograph} style={{ width: "100%" }} />
            {p.inscription ? <span style={{ marginTop: u(-18), fontFamily: "'Mrs Saint Delafield', cursive", fontSize: u(58), lineHeight: 1, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{p.inscription}</span> : null}
          </div>
        ) : null}
        <div className="absolute font-sans font-light" style={{ left: u(56), bottom: u(176), fontSize: u(62), letterSpacing: u(-1), lineHeight: 1 }}>{p.first}</div>
        <div className="absolute truncate font-sans font-extrabold" style={{ left: u(54), right: u(54), bottom: u(92), fontSize: u(p.last.length > 9 ? 84 : 104), lineHeight: 0.95, letterSpacing: u(-4) }}>{p.last}</div>
        <div className="absolute flex justify-between font-sans font-extrabold" style={{ left: u(58), right: u(56), bottom: u(52), fontSize: u(20), letterSpacing: u(5), color: "rgba(255,255,255,0.8)" }}>
          <span>{(p.position ?? "ATHLETE").toUpperCase().slice(0, 18)}</span>
          <span>{p.kind === "attendee" ? (p.serial ?? (p.sponsor ? `PRESENTED BY ${p.sponsor.toUpperCase()}` : "")) : (p.team ?? "").toUpperCase()}</span>
        </div>
        {p.kind === "signed" && p.serial ? <div className="absolute font-sans font-extrabold" style={{ right: u(56), top: u(56), fontSize: u(22), letterSpacing: u(4) }}>{p.serial}</div> : null}
      </div>
    </Shell>
  );
}

/** The back: rating, attributes and bragging rights. */
export function CardBack(p: { first: string; last: string; ovr: number | null; number?: string | null; position: string | null; grad: number | null; team?: string | null;
  attrs: { short: string; value: number | null }[] | null; flex?: string | null; tests?: { label: string; value: string; by: string }[]; tally?: string; size?: "lg" | "sm" }) {
  return (
    <Shell lg={(p.size ?? "lg") === "lg"} label={`Back of ${p.first} ${p.last}'s card`}>
      <div className="absolute inset-0 bg-[#0b0b0b] font-sans">
        <div className="absolute" style={{ inset: u(24), border: `${u(2)} solid rgba(255,255,255,0.75)`, borderRadius: u(12) }} />
        <div className="absolute flex items-start justify-between" style={{ left: u(56), right: u(56), top: u(60) }}>
          <div className="font-light leading-none" style={{ fontSize: u(54), letterSpacing: u(-1) }}>{p.first}<b className="block truncate font-extrabold" style={{ fontSize: u(84), letterSpacing: u(-3), maxWidth: u(440) }}>{p.last}</b></div>
          <div className="text-right leading-[0.85]"><b className="block font-extrabold" style={{ fontSize: u(140), letterSpacing: u(-6) }}>{p.ovr ?? "--"}</b>
            <span className="font-extrabold" style={{ fontSize: u(20), letterSpacing: u(6), color: "rgba(255,255,255,0.7)" }}>OVERALL</span></div>
        </div>
        <div className="absolute flex font-extrabold" style={{ left: u(58), right: u(56), top: u(270), gap: u(34), fontSize: u(18), letterSpacing: u(4), color: "rgba(255,255,255,0.65)" }}>
          {[["NO.", p.number ? p.number.padStart(2, "0") : "--"], ["POS", posShort(p.position)], ["CLASS", p.grad ? String(p.grad) : "--"], ["TEAM", p.team ?? "--"]].map(([k, v]) => (
            <span key={k} className="min-w-0">{k}<b className="block truncate text-white" style={{ fontSize: u(32), letterSpacing: 0, marginTop: u(4) }}>{v}</b></span>
          ))}
        </div>
        <div className="absolute grid grid-cols-6" style={{ left: u(56), right: u(56), top: u(370), borderTop: `${u(2)} solid rgba(255,255,255,0.3)`, borderBottom: `${u(2)} solid rgba(255,255,255,0.3)` }}>
          {(p.attrs ?? ["SPD", "AGI", "EXP", "STR", "TEC", "IQ"].map((s) => ({ short: s, value: null }))).map((a) => (
            <div key={a.short} className="text-center" style={{ padding: `${u(18)} 0` }}>
              <b className="block font-extrabold" style={{ fontSize: u(50), letterSpacing: u(-2) }}>{p.attrs ? a.value ?? "–" : "🔒"}</b>
              <span className="font-extrabold" style={{ fontSize: u(16), letterSpacing: u(4), color: "rgba(255,255,255,0.6)" }}>{a.short}</span>
            </div>
          ))}
        </div>
        {p.flex ? (
          <div className="absolute flex items-baseline bg-white text-[#0b0b0b]" style={{ left: u(56), right: u(56), top: u(540), padding: `${u(20)} ${u(26)}`, gap: u(18) }}>
            <b className="font-extrabold" style={{ fontSize: u(58), letterSpacing: u(-2) }}>#1</b>
            <span className="font-extrabold" style={{ fontSize: u(26), lineHeight: 1.15 }}>{p.flex}</span>
          </div>
        ) : null}
        <div className="absolute" style={{ left: u(56), right: u(56), top: u(p.flex ? 690 : 560) }}>
          {(p.tests ?? []).slice(0, 3).map((t) => (
            <div key={t.label} className="flex justify-between" style={{ padding: `${u(13)} 0`, borderBottom: `${u(1)} solid rgba(255,255,255,0.2)`, fontSize: u(27) }}>
              <span>{t.label}</span><b className="font-extrabold">{t.value} <span className="font-extrabold" style={{ fontSize: u(19), letterSpacing: u(2), color: "rgba(255,255,255,0.55)" }}>{t.by}</span></b>
            </div>
          ))}
          {p.tally ? <div className="flex justify-between" style={{ padding: `${u(13)} 0`, fontSize: u(27) }}><span>Titles · MVPs · Cards</span><b className="font-extrabold">{p.tally}</b></div> : null}
        </div>
        <div className="absolute flex justify-between font-extrabold" style={{ left: u(58), right: u(56), bottom: u(52), fontSize: u(19), letterSpacing: u(6), color: "rgba(255,255,255,0.75)" }}>
          <span>#EARNEDNOTBOUGHT</span><span>PROLYT 26/27</span>
        </div>
      </div>
    </Shell>
  );
}

export function PlayerCard(p: CardProps) {
  if (p.tier === "signed" || p.tier === "attendee") return <ModernCard {...p} kind={p.tier} />;
  return <ChromeCard {...p} kind={p.tier} />;
}
