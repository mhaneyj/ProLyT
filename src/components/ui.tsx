import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-muted">{children}</div>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[34px] uppercase leading-none">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">{children}</h2>
      {right}
    </div>
  );
}

export function Card({ children, className = "", accent = false, id }: { children: ReactNode; className?: string; accent?: boolean; id?: string }) {
  return (
    <div id={id} className={`${id ? "scroll-mt-20 " : ""}rounded-xl border p-4 ${accent ? "border-gold bg-gold/5" : "border-line bg-panel"} ${className}`}>{children}</div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "gold" | "warn" }) {
  const color = tone === "good" ? "text-good" : tone === "gold" ? "text-gold" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
      <div className="text-[11px] uppercase text-muted">{label}</div>
      <div className={`tabular font-display text-[26px] leading-tight ${color}`}>{value}</div>
    </div>
  );
}

const btnBase =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md px-4 font-cond text-[18px] font-extrabold uppercase tracking-[2px] transition-colors disabled:opacity-50";
const btnKinds = {
  primary: "bg-gold text-on-gold hover:bg-gold-hover",
  ghost: "border-2 border-[#3a3a3a] text-cream hover:border-gold",
  good: "border-2 border-good text-good",
};

export function Button({ kind = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof btnKinds }) {
  return <button {...p} className={`${btnBase} ${btnKinds[kind]} ${className}`} />;
}

export function LinkButton({ href, kind = "primary", children, className = "" }: { href: string; kind?: keyof typeof btnKinds; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`${btnBase} ${btnKinds[kind]} ${className}`}>
      {children}
    </Link>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "gold" | "warn" | "bad" }) {
  const t = {
    muted: "border border-line text-soft",
    good: "bg-good text-ink",
    gold: "bg-gold text-on-gold",
    warn: "bg-warn text-ink",
    bad: "bg-bad text-ink",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${t}`}>{children}</span>;
}

export function Notice({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "good" | "bad" }) {
  const border = tone === "good" ? "border-good" : tone === "bad" ? "border-bad" : "border-line";
  const icon = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-gold";
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`flex gap-2.5 rounded-lg border ${border} p-3 text-[13px] leading-relaxed text-soft`}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`mt-0.5 flex-none ${icon}`}>
        <circle cx="12" cy="12" r="9" />
        {tone === "good" ? <path d="M8 12.5l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M12 8v5M12 16h.01" strokeLinecap="round" />}
      </svg>
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <div className="font-semibold">{title}</div>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
