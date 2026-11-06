import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { asService, isDemo } from "@/lib/db";
import { BadCode, requestLink, verifyCode, RateLimited, SESSION_DAYS, signInWithPassword } from "@/lib/session";
import { sendSignInEmail } from "@/lib/email";
import { DEMO_COOKIE, sessionCookieName } from "@/lib/auth";
import { DEMO_USERS } from "@/lib/demo-seed";
import { Button, Kicker, Notice } from "@/components/ui";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { PoweredBy, ProgramLogo, ProLytMark } from "@/components/brand";
import { CodeInput, PasskeySignIn } from "@/components/passkey";
import { googleConfigured } from "@/lib/sign-in";

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
  // The email comes from the form (prefilled), so switching tabs or apps can't lose it
  const email = String(form.get("email") ?? jar.get(EMAIL_COOKIE)?.value ?? "");
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

async function passwordSignIn(form: FormData) {
  "use server";
  if (isDemo) return;
  const next = safeNext(form.get("next"));
  const email = String(form.get("email") ?? "");
  const pw = String(form.get("password") ?? "");
  if (!pw) return sendCode(form); // no password typed: send a code instead
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").filter(Boolean);
  let session: string;
  try {
    session = (await asService((q) => signInWithPassword(q, email, pw, admins))).session;
  } catch (e) {
    redirect(withNext(`/login?error=${encodeURIComponent(e instanceof BadCode ? e.message : "Something went wrong. Try again.")}`, next));
  }
  const proto = ((await headers()).get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  (await cookies()).set(sessionCookieName(proto === "https"), session, {
    httpOnly: true, secure: proto === "https", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect(next || "/home");
}

async function startOver() {
  "use server";
  (await cookies()).delete(EMAIL_COOKIE);
  redirect("/login");
  // (codes already sent still work for 15 minutes)
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const brand = await brandBySlug(await currentOrgSlug());
  const sentTo = sp.sent ? ((await cookies()).get(EMAIL_COOKIE)?.value ?? "") : undefined;
  const input = "min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={80} /> : <ProLytMark className="text-4xl" />}
      <div>
        <Kicker>{brand ? brand.name : "ProLyt"}</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">{sentTo !== undefined ? "Enter your code" : "Sign in"}</h1>
        {sentTo === undefined && !isDemo ? <p className="mt-2 text-sm text-soft">Families, coaches and staff all sign in here. New? Same thing: we&apos;ll set you up.</p> : null}
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
      ) : sentTo !== undefined ? (
        <>
          <p className="text-sm text-soft">{sentTo ? <>We emailed a 6-digit code to <span className="font-semibold text-cream">{sentTo}</span>. It can take a minute; check spam too.</> : "Enter your email and the 6-digit code we sent you."}</p>
          <form action={checkCode} className="flex flex-col gap-3">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
            {sentTo ? <input type="hidden" name="email" value={sentTo} /> : (
              <>
                <label htmlFor="code-email" className="text-sm text-soft">Email</label>
                <input id="code-email" name="email" type="email" autoComplete="email" required className={input} />
              </>
            )}
            <label htmlFor="code" className="text-sm text-soft">Code</label>
            <CodeInput className={`${input} tabular text-center font-display text-3xl tracking-[10px]`} />
            <Button type="submit">Sign in</Button>
          </form>
          <form action={startOver} className="text-center">
            <button className="min-h-11 text-sm text-muted hover:text-cream">Wrong email or no code? Send a new one</button>
          </form>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
          <PasskeySignIn next={next} />
          {googleConfigured() ? (
            <a href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-md border-2 border-[#3a3a3a] font-semibold text-cream hover:border-gold">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
              Continue with Google
            </a>
          ) : null}
          <div className="flex items-center gap-3 text-[12px] uppercase tracking-[2px] text-muted"><span className="h-px flex-1 bg-line" />or email<span className="h-px flex-1 bg-line" /></div>
          <form action={passwordSignIn} className="flex flex-col gap-3">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <label htmlFor="email" className="sr-only">Email</label>
            <input id="email" name="email" type="email" autoComplete="username email" required placeholder="you@email.com" aria-label="Email" className={input} />
            <label htmlFor="password" className="sr-only">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Password (if you set one)" aria-label="Password" className={input} />
            <Button type="submit">Sign in</Button>
            <button formAction={sendCode} className="min-h-12 rounded-md border-2 border-[#3a3a3a] font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-cream hover:border-gold">Email me a code</button>
          </form>
          <p className="text-center text-xs text-muted">No password or forgot it? Use a code. You stay signed in for a year.</p>
        </div>
      )}
      {brand ? <div className="mt-auto text-center"><PoweredBy /></div> : null}
    </main>
  );
}
