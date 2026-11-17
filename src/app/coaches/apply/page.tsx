import Link from "next/link";
import { currentOrgSlug } from "@/lib/org";
import { asService } from "@/lib/db";
import { ProLytMark } from "@/components/brand";
import { applyToCoach } from "./actions";

export const metadata = { title: "Coach with us" };

export default async function Apply({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  const slug = await currentOrgSlug();
  const [org] = slug ? await asService((q) => q<{ name: string }>("select name from orgs where slug = $1 and status = 'active'", [slug])) : [];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
      <Link href="/coaches"><ProLytMark /></Link>
      <h1 className="font-display text-[40px] uppercase leading-none">Coach with us</h1>
      {!org ? <p className="text-soft">Coach applications are taken on a program&apos;s own page. <Link href="/coaches" className="underline">Back to coaches</Link></p>
        : sp.sent ? (
          <div role="status" className="rounded-[14px] border border-good/60 bg-good/5 p-4">
            <div className="font-semibold">Thanks. {org.name} will review your request.</div>
            <p className="mt-1 text-sm text-soft">If they approve it, sign in with the same email and you&apos;re on the coaching staff.</p>
          </div>
        ) : (
          <form action={applyToCoach} className="flex flex-col gap-3">
            <p className="text-soft">Tell {org.name} who you are. The owner reviews every request. Nothing is shared publicly.</p>
            {sp.error ? <p role="alert" className="text-sm text-bad">{sp.error}</p> : null}
            <label className="flex flex-col gap-1 text-sm text-soft">Your name
              <input name="name" required minLength={2} maxLength={80} autoComplete="name" className="min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-soft">Email (you&apos;ll sign in with this)
              <input name="email" type="email" required maxLength={120} autoComplete="email" className="min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-soft">What do you coach? (optional)
              <textarea name="note" maxLength={500} rows={4} placeholder="Position groups, years coaching, why here" className="rounded-md border border-[#333] bg-[#111] px-3 py-2 text-cream" />
            </label>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
            <button className="min-h-12 rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Send request</button>
          </form>
        )}
    </main>
  );
}
