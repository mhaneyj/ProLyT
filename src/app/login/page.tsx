import Image from "next/image";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { isDemo } from "@/lib/db";
import { DEMO_COOKIE } from "@/lib/auth";
import { DEMO_USERS } from "@/lib/demo-seed";
import { supabaseServer } from "@/lib/supabase/server";
import { Button, Card, Kicker, Notice } from "@/components/ui";

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
  const email = String(form.get("email") ?? "").trim();
  if (!email) redirect("/login?error=Enter%20your%20email");
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { error } = await (await supabaseServer()).auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  redirect(error ? `/login?error=${encodeURIComponent(error.message)}` : "/login?sent=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <Image src="/logo.png" alt="Game-Fit Loomis" width={120} height={92} priority />
      <div>
        <Kicker>Athlete portal</Kicker>
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
          <p className="mt-1 text-sm text-soft">We sent you a sign-in link. It works once and expires in an hour.</p>
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
    </main>
  );
}
