import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { asService, isDemo } from "@/lib/db";
import { BadCode, requestLink, verifyCode, RateLimited, SESSION_DAYS } from "@/lib/session";
import { sendSignInEmail } from "@/lib/email";
import { DEMO_COOKIE, sessionCookieName } from "@/lib/auth";
import { DEMO_USERS } from "@/lib/demo-seed";
import { Button, Card, Kicker, Notice } from "@/components/ui";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";

export const metadata = { title: "Sign in" };

const EMAIL_COOKIE = "prolyt_signin_email"; // remembers which email the code was sent to (never put in the URL)
const safeNext = (n: unknown) => {
  const s = String(n ?? "");
  return /^\/[a-z0-9/_-]*$/i.test(s) && !s.startsWith("//") ? s : "";
};
const withNext = (path: string, next: string) => (next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path);

async function demoSignIn(form: FormData) {
  "use server";
  if (!isDemo) return;
  const user = DEMO_USERS.find((u) => u.id === form.get("uid"));
  if (!user) return;
  (await cookies()).set(DEMO_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(safeNext(form.get("next")) || user.home);
}

async function sendCode(form: FormData) {
  "use server";
  if (isDemo) return;
  const next = safeNext(form.get("next"));
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "");
  let message: string | null = null;
  try {
    const { email, token, code } = await asService((q) => requestLink(q, String(form.get("email") ?? "")));
    const brand = await brandBySlug(await currentOrgSlug());
    await sendSignInEmail(email, `${origin}/auth/verify?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ""}`, code, brand?.name ?? null);
    (await cookies()).set(EMAIL_COOKIE, email, { httpOnly: true, secure: proto === "https", sameSite: "lax", path: "/", maxAge: 20 * 60 });
  } catch (e) {
    message = e instanceof RateLimited || e instanceof Error ? e.message : "Something went wrong. Try again.";
  }
  redirect(message ? withNext(`/login?error=${encodeURIComponent(message)}`, next) : withNext("/login?sent=1", next));
}

async function checkCode(form: FormData) {
  "use server";
  const next = safeNext(form.get("next"));
  const jar = await cookies();
  const email = jar.get(EMAIL_COOKIE)?.value ?? "";
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").filter(Boolean);
  let result: { session: string } | null = null;
  try {
    result = await asService((q) => verifyCode(q, email, String(form.get("code") ?? ""), admins));
  } catch (e) {
    const msg = e instanceof BadCode ? e.message : "Something went wrong. Try again.";
    redirect(withNext(`/login?sent=1&error=${encodeURIComponent(msg)}`, next));
  }
  if (!result) redirect(withNext(`/login?sent=1&error=${encodeURIComponent("That code expired. Send a new one.")}`, next));
  const proto = ((await headers()).get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  jar.set(sessionCookieName(proto === "https"), result.session, {
    httpOnly: true, secure: proto === "https", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  jar.delete(EMAIL_COOKIE);
  redirect(next || "/home");
}

async function startOver() {
  "use server";
  (await cookies()).delete(EMAIL_COOKIE);
  redirect("/login");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const brand = await brandBySlug(await currentOrgSlug());
  const sentTo = sp.sent ? (await cookies()).get(EMAIL_COOKIE)?.value : undefined;
  const input = "min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={80} /> : <ProLytMark className="text-4xl" />}
      <div>
        <Kicker>{brand ? brand.name : "ProLyt"}</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">{sentTo ? "Check your email" : "Sign in"}</h1>
        {!sentTo && !isDemo ? <p className="mt-2 text-sm text-soft">Families, coaches and staff all sign in here. New? Same thing: we&apos;ll set you up.</p> : null}
      </div>

      {isDemo ? (
        <>
          <Notice>Demo mode with sample families. Pick who you want to be. Nothing you do here is saved after a restart.</Notice>
          <form action={demoSignIn} className="flex flex-col gap-2">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            {DEMO_USERS.map((u) => (
              <button key={u.id} name="uid" value={u.id}
                className="flex min-h-16 items-center justify-between rounded-xl border border-line bg-panel px-4 text-left hover:border-gold">
                <span>
                  <span className="block font-semibold">{u.name}</span>
                  <span className="block text-xs text-muted">{u.role}</span>
                </span>
                <span aria-hidden="true" className="text-gold">→</span>
              </button>
            ))}
          </form>
        </>
      ) : sentTo ? (
        <>
          <p className="text-sm text-soft">We sent a 6-digit code to <span className="font-semibold text-cream">{sentTo}</span>.</p>
          <form action={checkCode} className="flex flex-col gap-3">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
            <label htmlFor="code" className="text-sm text-soft">Code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus
              placeholder="123456" className={`${input} tabular text-center font-display text-3xl tracking-[10px]`} />
            <Button type="submit">Sign in</Button>
          </form>
          <form action={startOver} className="text-center">
            <button className="min-h-11 text-sm text-muted hover:text-cream">Wrong email or no code? Start over</button>
          </form>
        </>
      ) : (
        <form action={sendCode} className="flex flex-col gap-3">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
          <label htmlFor="email" className="text-sm text-soft">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className={input} />
          <Button type="submit">Email me a code</Button>
          <p className="text-xs text-muted">No passwords. You stay signed in on this device for 90 days.</p>
        </form>
      )}
      {sp.sent && !sentTo && !isDemo ? (
        <Card><div className="text-sm text-soft">This sign-in screen expired. <Link href="/login" className="font-semibold">Start again</Link></div></Card>
      ) : null}
      {brand ? <div className="mt-auto text-center"><PoweredBy /></div> : null}
    </main>
  );
}
