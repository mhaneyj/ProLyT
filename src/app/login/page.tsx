import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { asService, isDemo } from "@/lib/db";
import { requestLink, RateLimited } from "@/lib/session";
import { sendSignInEmail } from "@/lib/email";
import { DEMO_COOKIE } from "@/lib/auth";
import { DEMO_USERS } from "@/lib/demo-seed";
import { Button, Card, Kicker, Notice } from "@/components/ui";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

export const metadata = { title: "Sign in" };

async function demoSignIn(form: FormData) {
  "use server";
  if (!isDemo) return;
  const user = DEMO_USERS.find((u) => u.id === form.get("uid"));
  if (!user) return;
  (await cookies()).set(DEMO_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(user.home);
}

async function emailSignIn(form: FormData) {
  "use server";
  if (isDemo) return;
  const h = await headers();
  // Link back to the same program address they signed in from
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "");
  let message: string | null = null;
  try {
    const { email, token } = await asService((q) => requestLink(q, String(form.get("email") ?? "")));
    const brand = await brandBySlug(await currentOrgSlug());
    await sendSignInEmail(email, `${origin}/auth/verify?token=${encodeURIComponent(token)}`, brand?.name ?? null);
  } catch (e) {
    message = e instanceof RateLimited || e instanceof Error ? e.message : "Something went wrong. Try again.";
  }
  redirect(message ? `/login?error=${encodeURIComponent(message)}` : "/login?sent=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  const brand = await brandBySlug(await currentOrgSlug());
  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={80} /> : <ProLytMark className="text-4xl" />}
      <div>
        <Kicker>{brand ? brand.name : "ProLyt"}</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Sign in</h1>
      </div>

      {isDemo ? (
        <>
          <Notice>Demo mode with sample families. Pick who you want to be. Nothing you do here is saved after a restart.</Notice>
          <form action={demoSignIn} className="flex flex-col gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.id}
                name="uid"
                value={u.id}
                className="flex min-h-16 items-center justify-between rounded-xl border border-line bg-panel px-4 text-left hover:border-gold"
              >
                <span>
                  <span className="block font-semibold">{u.name}</span>
                  <span className="block text-xs text-muted">{u.role}</span>
                </span>
                <span aria-hidden="true" className="text-gold">→</span>
              </button>
            ))}
          </form>
        </>
      ) : sp.sent ? (
        <Card accent>
          <div className="font-semibold">Check your email</div>
          <p className="mt-1 text-sm text-soft">We sent you a sign-in link. Open it on this device. It works once and expires in 15 minutes.</p>
        </Card>
      ) : (
        <form action={emailSignIn} className="flex flex-col gap-3">
          {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
          <label htmlFor="email" className="text-sm text-soft">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream"
          />
          <Button type="submit">Email me a sign-in link</Button>
          <p className="text-xs text-muted">No passwords. New families can register after signing in.</p>
        </form>
      )}
      {brand ? <div className="mt-auto text-center"><PoweredBy /></div> : null}
    </main>
  );
}
