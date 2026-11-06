import Link from "next/link";
import { redirect } from "next/navigation";
import { asService, asUser, dbMessage } from "@/lib/db";
import { getMe } from "@/lib/auth";
import { shareHash } from "@/lib/share";
import { Button, Kicker, Notice } from "@/components/ui";
import { PoweredBy, ProLytMark } from "@/components/brand";

export const metadata = { title: "ProLyt", robots: { index: false } };

type Preview = { kind: "parent" | "athlete"; first_name: string; ok: boolean; reason: string | null };

async function accept(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/link/${token}`)}`);
  let id = "";
  try {
    const [row] = await asUser(me.id, (q) => q<{ id: string }>("select accept_athlete_link($1, $2) id", [shareHash(token), String(form.get("signer") ?? "") || null]));
    id = row.id;
  } catch (e) {
    redirect(`/link/${token}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  redirect(`/athlete/${id}?linked=1`);
}

export default async function LinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const [p] = /^[\w-]{20,40}$/.test(token)
    ? await asService((q) => q<Preview>("select * from athlete_link_preview($1)", [shareHash(token)]))
    : [];
  const me = await getMe();
  const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <ProLytMark className="text-3xl" />
      {!p || !p.ok ? (
        <>
          <h1 className="font-display text-[40px] uppercase leading-none">This link isn&apos;t active</h1>
          <p className="text-soft">{p?.reason ?? "Check the link."} Ask for a new one.</p>
        </>
      ) : p.kind === "parent" ? (
        <>
          <div>
            <Kicker>Parent approval</Kicker>
            <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Approve {p.first_name}&apos;s profile</h1>
          </div>
          <ul className="flex flex-col gap-2 text-sm text-soft">
            <li>· You&apos;ll see everything on {p.first_name}&apos;s profile and every adult who messages them.</li>
            <li>· Nothing is public until you choose to share it. Their birthday, school address and phone are never shown.</li>
            <li>· Any adult messaging {p.first_name} is always copied to you. You can block anyone.</li>
          </ul>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          {me ? (
            <form action={accept} className="flex flex-col gap-3">
              <input type="hidden" name="token" value={token} />
              <label htmlFor="signer" className="text-sm text-soft">Type your full name to approve</label>
              <input id="signer" name="signer" autoComplete="name" required className={input} />
              <p className="text-xs text-muted">I&apos;m {p.first_name}&apos;s parent or legal guardian and agree to the <Link href="/legal/participation" className="underline">terms</Link> and <Link href="/legal/privacy" className="underline">family privacy notice</Link>.</p>
              <Button type="submit">Approve</Button>
              <p className="text-xs text-muted">Signed in as {me.email}.</p>
            </form>
          ) : (
            <>
              <Link href={`/login?next=${encodeURIComponent(`/link/${token}`)}`} className="flex min-h-14 items-center justify-center rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold">Sign in to approve</Link>
              <p className="text-xs text-muted">Use your own email. We&apos;ll send a 6-digit code.</p>
            </>
          )}
        </>
      ) : (
        <>
          <div>
            <Kicker>Your own login</Kicker>
            <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Hey {p.first_name}, your profile is ready</h1>
            <p className="mt-2 text-soft">Sign in with your own email to connect it. Your parent keeps oversight until you&apos;re 18.</p>
          </div>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          {me ? (
            <form action={accept} className="flex flex-col gap-2">
              <input type="hidden" name="token" value={token} />
              <Button type="submit">This is me, connect my login</Button>
              <p className="text-xs text-muted">Signed in as {me.email}.</p>
            </form>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(`/link/${token}`)}`} className="flex min-h-14 items-center justify-center rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold">Sign in</Link>
          )}
        </>
      )}
      <div className="mt-auto text-center"><PoweredBy /></div>
    </main>
  );
}
