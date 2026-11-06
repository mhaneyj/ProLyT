import Link from "next/link";
import type { ReactNode } from "react";
import { shortDate } from "@/lib/domain/format";
import { Icon, type IconName } from "./icons";

export function Avatar({ id, first, last, hasPhoto, size = 44 }: { id: string; first: string; last: string; hasPhoto: boolean; size?: number }) {
  return hasPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/photo/${id}`} alt="" width={size} height={size} className="flex-none rounded-full border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="grid flex-none place-items-center rounded-full border border-[#3a3a3a] bg-raised font-cond font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>{first[0]}{last[0]}</span>
  );
}

/** Kid pills at the top of family screens. `to` uses __KID__ for the athlete id. */
export function KidSwitcher({ kids, current, to }: { kids: { id: string; first_name: string }[]; current: string; to: string }) {
  if (kids.length < 2) return null;
  return (
    <div role="group" aria-label="Athlete" className="flex gap-2">
      {kids.map((k) => (
        <a key={k.id} href={`/kid/${k.id}?to=${encodeURIComponent(to)}`} aria-current={k.id === current ? "true" : undefined}
          className={`flex min-h-[52px] flex-1 items-center justify-center rounded-full font-semibold ${k.id === current ? "border-2 border-gold bg-gold text-on-gold" : "border border-line text-cream hover:border-gold"}`}>
          {k.first_name}
        </a>
      ))}
    </div>
  );
}

/** Big photo card. Falls back to a brand-color gradient when there's no photo. */
export function Hero({ photo, kicker, title, sub, children, minH = 170 }: { photo?: string | null; kicker: string; title: ReactNode; sub?: ReactNode; children?: ReactNode; minH?: number }) {
  return (
    <div className="relative flex flex-col justify-end overflow-hidden rounded-[14px] border border-line p-[18px]" style={{ minHeight: minH }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-60" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-gold) 38%, transparent), transparent 60%), linear-gradient(160deg, #1b1b1b, #0b0b0b)" }} />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0)_20%,rgba(7,7,7,0.92)_85%)]" />
      <div className="relative flex flex-col gap-1">
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{kicker}</div>
        <div className="font-display text-[28px] uppercase leading-[1.05]">{title}</div>
        {sub ? <div className="text-sm text-soft">{sub}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function StatTile({ label, value, delta, good = true }: { label: string; value: string; delta?: string | null; good?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-panel p-3">
      <div className="truncate text-[11px] uppercase tracking-[1px] text-muted">{label}</div>
      <div className="tabular font-display text-2xl">{value}</div>
      {delta ? <div className={`text-xs font-semibold ${good ? "text-good" : "text-warn"}`}>{delta}</div> : <div className="text-xs text-muted">Best</div>}
    </div>
  );
}

export function NoteCard({ coach, date, body, focus }: { coach: string | null; date: string; body: string; focus: string | null }) {
  return (
    <div className="flex gap-3 rounded-[10px] border border-line bg-panel px-4 py-3.5">
      <span className="grid size-10 flex-none place-items-center rounded-full bg-gold/15 text-gold"><Icon name="note" size={20} /></span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[13px] text-muted">{shortDate(date)}{coach ? ` · ${coach}` : ""}</div>
        <div className="text-[15px] leading-[1.45]">{body}</div>
        {focus ? <div className="text-[13px] font-semibold text-gold">Next focus: {focus}</div> : null}
      </div>
    </div>
  );
}

export function Tile({ href, icon, title, sub, accent }: { href: string; icon: IconName; title: string; sub: string; accent?: boolean }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 rounded-[10px] border border-line bg-panel px-3.5 py-3 hover:border-gold">
      <Icon name={icon} className="flex-none text-gold" />
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{title}</span>
        <span className={`truncate text-xs ${accent ? "text-gold" : "text-muted"}`}>{sub}</span>
      </span>
    </Link>
  );
}

/** "Get started" checklist so a brand-new account always knows the next step. */
export function Checklist({ items }: { items: { done: boolean; label: string; href: string }[] }) {
  if (items.every((i) => i.done)) return null;
  const left = items.filter((i) => !i.done).length;
  return (
    <div className="rounded-[14px] border border-gold/60 bg-gold/5 p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Get started</div>
        <div className="text-xs text-muted">{items.length - left} of {items.length} done</div>
      </div>
      <ul className="mt-2 flex flex-col">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex min-h-12 items-center gap-3">
              <span className={`grid size-6 flex-none place-items-center rounded-full ${i.done ? "bg-good text-ink" : "border-2 border-[#555]"}`}>
                {i.done ? <Icon name="check" size={14} /> : null}
              </span>
              <span className={`flex-1 ${i.done ? "text-muted line-through" : "font-semibold"}`}>{i.label}</span>
              {!i.done ? <Icon name="chevron" size={18} className="text-gold" /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The athlete's profile picture as a circle (initials when there's no photo). */
export function ProfileCircle({ src, first, last, size = 96, children }: { src: string | null; first: string; last: string; size?: number; children?: ReactNode }) {
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <div className="grid size-full place-items-center overflow-hidden rounded-full border-[3px] border-white/85 bg-black/35 shadow-[0_6px_24px_rgba(0,0,0,0.45)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={`${first} ${last}`} className="size-full object-cover" />
          : <span aria-hidden="true" className="font-display leading-none text-white/90" style={{ fontSize: size * 0.38 }}>{first[0]}{last[0]}</span>}
      </div>
      {children ? <div className="absolute -bottom-1 -right-1">{children}</div> : null}
    </div>
  );
}
