import Link from "next/link";
import { redirect } from "next/navigation";
import { asService, asUser, dbMessage } from "@/lib/db";
import { getMe, homeFor } from "@/lib/auth";
import { inviteHash } from "@/lib/invite";
import { themeVars } from "@/lib/domain/brand";
import { Button, Kicker, Notice } from "@/components/ui";
import { PoweredBy, ProgramLogo } from "@/components/brand";

export const metadata = { title: "Join", robots: { index: false } };

type Preview = { org_name: string; org_slug: string; logo_url: string | null; brand_color: string; role: "owner" | "coach"; ok: boolean; reason: string | null };

async function accept(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  try {
    await asUser(me.id, (q) => q("select accept_invite($1)", [inviteHash(token)]));
  } catch (e) {
    redirect(`/join/${token}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  redirect("/home");
}

export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const [p] = /^[\w-]{20,40}$/.test(token)
    ? await asService((q) => q<Preview>("select * from invite_preview($1)", [inviteHash(token)]))
    : [];
  const me = await getMe();
  const already = me && p && me.programs.some((x) => x.slug === p.org_slug) && me.roles.includes(p.role);

  return (
    <main style={p ? (themeVars(p.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      {p ? <ProgramLogo brand={{ name: p.org_name, logo_url: p.logo_url, brand_color: p.brand_color } as never} size={80} /> : null}
      {!p ? (
        <>
          <h1 className="font-display text-[40px] uppercase leading-none">Invite not found</h1>
          <p className="text-soft">Check the link, or ask whoever sent it for a new one.</p>
        </>
      ) : !p.ok ? (
        <>
          <Kicker>{p.org_name}</Kicker>
          <h1 className="font-display text-[40px] uppercase leading-none">Can&apos;t join with this link</h1>
          <p className="text-soft">{p.reason} Ask whoever sent it for a new one.</p>
        </>
      ) : (
        <>
          <div>
            <Kicker>{p.org_name}</Kicker>
            <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Join as {p.role === "owner" ? "program owner" : "coach"}</h1>
            <p className="mt-2 text-soft">
              {p.role === "owner" ? "Run the program: staff, sessions, packages and branding." : "Run sessions, check athletes in, log results and send notes to families."}
            </p>
          </div>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          {already ? (
            <>
              <Notice tone="good">You&apos;re already on the staff here.</Notice>
              <Link href={me ? homeFor(me) : "/home"} className="font-semibold">Go to the app →</Link>
            </>
          ) : me ? (
            <form action={accept} className="flex flex-col gap-2">
              <input type="hidden" name="token" value={token} />
              <Button type="submit">Join {p.org_name}</Button>
              <p className="text-xs text-muted">Signed in as {me.email ?? me.name}.</p>
            </form>
          ) : (
            <>
              <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
                className="flex min-h-14 items-center justify-center rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold">
                Sign in to join
              </Link>
              <p className="text-xs text-muted">Use any email. We&apos;ll send a 6-digit code. No passwords.</p>
            </>
          )}
        </>
      )}
      <div className="mt-auto text-center"><PoweredBy /></div>
    </main>
  );
}
