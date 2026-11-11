import Link from "next/link";
import { money } from "@/lib/domain/format";

export type TrainerCardRow = { user_id: string; slug: string; display_name: string; headline: string | null; city: string | null; specialties: string[];
  verified: boolean; has_photo: boolean; program: string | null; from_cents: number | null; next_at: string | null };

export function TrainerAvatar({ id, name, has, size = 64 }: { id: string; name: string; has: boolean; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return has ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/trainer/photo/${id}`} alt="" width={size} height={size} style={{ width: size, height: size }} className="flex-none rounded-full border-2 border-gold object-cover" />
  ) : <span aria-hidden="true" style={{ width: size, height: size }} className="flex flex-none items-center justify-center rounded-full border-2 border-gold/60 bg-gold/10 font-display text-[22px] text-gold">{initials}</span>;
}

export function TrainerCard({ t }: { t: TrainerCardRow }) {
  const next = t.next_at ? new Date(t.next_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <Link href={`/trainers/${t.slug}`} className="flex gap-3 rounded-[14px] border border-line bg-panel p-3.5 hover:border-gold">
      <TrainerAvatar id={t.user_id} name={t.display_name} has={t.has_photo} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">{t.display_name}</span>
          {t.from_cents != null ? <span className="flex-none text-sm text-soft">from <span className="font-bold text-cream">{money(t.from_cents)}</span></span> : null}
        </span>
        {t.headline ? <span className="line-clamp-2 text-[13px] text-soft">{t.headline}</span> : null}
        <span className="flex flex-wrap gap-1">
          {t.verified ? <span className="rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-bold text-good">✓ Background checked</span> : null}
          {t.specialties.slice(0, 4).map((s) => <span key={s} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-soft">{s}</span>)}
        </span>
        <span className="text-[12px] text-muted">{[t.city, t.program, next ? `Next open: ${next}` : "No open times right now"].filter(Boolean).join(" · ")}</span>
      </span>
    </Link>
  );
}
