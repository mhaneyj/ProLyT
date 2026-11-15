import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Button, Card, Notice, Title } from "@/components/ui";
import { loadAthlete } from "../header";
import { agree, decide, make, withdraw } from "./actions";

export const metadata = { title: "AI action shot" };
export const maxDuration = 60;

type Shot = { id: string; status: "pending" | "ready" | "approved" | "rejected" | "failed"; note: string | null; created_at: string };

export default async function AiPhoto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/ai-photo");
  if (!a.family) return <p className="text-soft">Only {a.first_name}&apos;s parent or guardian can make action shots.</p>;
  const d = await asUser(me.id, async (q) => ({
    consent: (await q<{ c: boolean }>("select (ai_consent_at is not null) c from athletes where id = $1", [id]))[0]?.c ?? false,
    guardian: (await q<{ g: boolean }>("select is_guardian($1) g", [id]))[0]?.g ?? false,
    shots: await q<Shot>("select id, status, note, created_at::text from athlete_ai_photos where athlete_id = $1 and status in ('ready','approved','failed') order by created_at desc limit 6", [id]),
    used: (await q<{ n: number }>("select count(*)::int n from athlete_ai_photos where athlete_id = $1 and status <> 'failed' and created_at >= date_trunc('month', now())", [id]))[0].n,
  }));
  if (!d.guardian) return <p className="text-soft">Only {a.first_name}&apos;s parent or guardian can make action shots.</p>;
  const left = Math.max(0, 3 - d.used);
  return (
    <>
      {switcher}
      <Link href={`/athlete/${a.id}/cards`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {a.first_name}&apos;s card</Link>
      <Title sub="An AI-made action photo for the Player Card. You approve every one.">Action shot</Title>
      {sp.ok ? <Notice tone="good">{sp.ok === "approved" ? "Approved. It's on the card now." : "Removed. The card uses the real photo."}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      {!d.consent ? (
        <Card className="flex flex-col gap-3">
          <div className="font-semibold">Before we start</div>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-soft">
            <li>{a.first_name}&apos;s photo is sent to a third-party AI image service (fal.ai) to make the action shot.</li>
            <li>Nothing goes on the card until you approve it. You can remove it anytime, and the card goes back to the real photo.</li>
            <li>Shots never include logos, school names or team names.</li>
            <li>You can switch this off whenever you want.</li>
          </ul>
          <form action={agree.bind(null, a.id)}><Button type="submit">I agree, continue</Button></form>
        </Card>
      ) : !a.has_photo ? (
        <Card className="flex flex-col gap-2"><div className="font-semibold">Add a photo first</div><p className="text-sm text-soft">Upload a clear photo of {a.first_name} (face visible, good light) and come back.</p><Link href={`/athlete/${a.id}`} className="text-sm font-semibold text-gold">Go to {a.first_name}&apos;s profile →</Link></Card>
      ) : (
        <>
          <form action={make.bind(null, a.id)} className="flex flex-col gap-2">
            <Button type="submit" disabled={left === 0}>Make an action shot</Button>
            <p className="text-center text-[12px] text-muted">{left} of 3 left this month. It takes about 20 seconds.</p>
          </form>
          {d.shots.map((s) => (
            <Card key={s.id} accent={s.status === "approved"} className="flex flex-col gap-3">
              {s.status === "failed" ? <p className="text-sm text-soft">{s.note ?? "That one didn't work."} It didn&apos;t count against your 3.</p> : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/ai-photo/${s.id}`} alt={`Action shot of ${a.first_name}`} className="mx-auto w-full max-w-[300px] rounded-lg" />
                  <form action={decide.bind(null, a.id)} className="grid grid-cols-2 gap-2">
                    <input type="hidden" name="shot" value={s.id} />
                    {s.status === "approved" ? <span className="col-span-1 flex min-h-12 items-center justify-center font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">On the card</span>
                      : <Button type="submit" name="approve" value="1">Use on card</Button>}
                    <Button kind="ghost" type="submit" name="approve" value="0">{s.status === "approved" ? "Use real photo" : "Discard"}</Button>
                  </form>
                </>
              )}
            </Card>
          ))}
          <form action={withdraw.bind(null, a.id)}><button className="min-h-11 text-[13px] text-muted underline">Turn off AI photos for {a.first_name}</button></form>
        </>
      )}
    </>
  );
}
