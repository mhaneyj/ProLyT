import Link from "next/link";

export type PassRow = { pass_code: string; first_name: string; event: string; event_id: string; starts_on: string; checked_in_at: string | null };

/** Upcoming event passes: one tap to the QR at check-in, then to live scores. */
export function PassCards({ passes }: { passes: PassRow[] }) {
  return (
    <>
      {passes.map((p) => (
        <Link key={p.pass_code} href={p.checked_in_at ? `/e/${p.event_id}` : `/pass/${p.pass_code}`}
          className="flex min-h-16 items-center justify-between gap-3 rounded-[14px] border-2 border-gold bg-gold/10 px-4">
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[2px] text-gold">{p.checked_in_at ? `✓ ${p.first_name} checked in` : `${p.first_name}'s event pass`}</span>
            <span className="block font-semibold leading-snug">{p.event}</span>
            {!p.checked_in_at ? <span className="block text-[12px] text-soft">{new Date(`${p.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span> : null}
          </span>
          <span className="flex-none text-sm font-bold text-gold">{p.checked_in_at ? "Live scores →" : "Show QR →"}</span>
        </Link>
      ))}
    </>
  );
}
