import Link from "next/link";
import { requireCollege } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Empty, Title } from "@/components/ui";
import { removeWatch } from "../actions";

export const metadata = { title: "Watchlist · College Coach Pass" };
type W = { athlete_id: string; available: boolean; first_name: string | null; last_name: string | null; pos: string | null; grad_year: number | null; note: string; updated_at: string };

export default async function Watchlist() {
  const me = await requireCollege();
  const rows = await asUser(me.id, (q) => q<W>("select * from college_watchlist()"));
  return (
    <>
      <Title sub="Your private notes. Only you can see them.">Watchlist</Title>
      {rows.length === 0 ? <Empty title="Nobody yet">Open an athlete and save a note to add them here.</Empty> : (
        <ul className="flex flex-col gap-2">
          {rows.map((w) => (
            <li key={w.athlete_id} className="rounded-[14px] border border-line bg-panel p-3">
              {w.available ? (
                <Link href={`/college/athlete/${w.athlete_id}`} className="block">
                  <div className="font-semibold">{w.first_name} {w.last_name}</div>
                  <div className="text-sm text-soft">{[w.pos, w.grad_year ? `Class of ${w.grad_year}` : null].filter(Boolean).join(" · ")}</div>
                  {w.note ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{w.note}</p> : null}
                </Link>
              ) : (
                <div className="text-sm text-muted">This athlete is no longer shared with colleges. Your note is kept, but their details are hidden.</div>
              )}
              <form action={removeWatch} className="mt-2"><input type="hidden" name="id" value={w.athlete_id} /><button className="min-h-11 text-sm text-soft underline">Remove</button></form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
