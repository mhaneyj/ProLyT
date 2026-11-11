import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { BadCode, setPassword } from "@/lib/session";
import { Button, Card, Notice, Title } from "@/components/ui";
import { signOut } from "@/app/sign-out";
import { EnablePush } from "@/components/enable-push";

export const metadata = { title: "Account" };

async function saveName(form: FormData) {
  "use server";
  const me = await requireMe();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) redirect("/account?error=" + encodeURIComponent("Enter your name"));
  await asUser(me.id, (q) => q("update profiles set full_name = $2 where id = $1", [me.id, name]));
  revalidatePath("/", "layout");
  redirect("/account?saved=name");
}

async function savePassword(form: FormData) {
  "use server";
  const me = await requireMe();
  const pw = String(form.get("password") ?? "");
  if (pw !== String(form.get("confirm") ?? "")) redirect("/account?error=" + encodeURIComponent("The two passwords don't match"));
  try {
    await asService((q) => setPassword(q, me.id, pw));
  } catch (e) {
    redirect("/account?error=" + encodeURIComponent(e instanceof BadCode ? e.message : "Couldn't save the password"));
  }
  redirect("/account?saved=password");
}

export default async function Account({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const [u] = await asService((q) => q<{ has_pw: boolean; changed: string | null; passkeys: number }>(
    `select password_hash is not null has_pw, password_changed_at::text changed, (select count(*)::int from auth.passkeys where user_id = $1) passkeys
     from auth.users where id = $1`, [me.id]));
  const [p] = await asUser(me.id, (q) => q<{ full_name: string }>("select full_name from profiles where id = $1", [me.id]));
  const [{ sale: plusForSale }] = await asUser(me.id, (q) => q<{ sale: boolean }>("select not plus_free_for_all() sale"));
  const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  return (
    <>
      <Title sub={me.email ?? undefined}>Account</Title>
      {sp.saved === "name" ? <Notice tone="good">Name saved. Coaches and families see it on messages and comments.</Notice> : null}
      {sp.saved === "password" ? <Notice tone="good">Password saved. Sign in with your email and password any time.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card>
        <form action={saveName} className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-semibold">Your name</label>
          <input id="name" name="name" defaultValue={p?.full_name ?? ""} autoComplete="name" placeholder="First and last name" className={input} />
          <Button type="submit" kind="ghost">Save name</Button>
        </form>
      </Card>

      <Card>
        <form action={savePassword} className="flex flex-col gap-2">
          <div className="text-sm font-semibold">{u?.has_pw ? "Change password" : "Set a password"}</div>
          <p className="text-[12px] text-muted">{u?.has_pw ? "Signs in with your email and this password." : "Optional. Then you can sign in with email and password instead of a code."}</p>
          <input type="text" name="username" autoComplete="username" value={me.email ?? ""} readOnly hidden />
          <label htmlFor="password" className="sr-only">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="New password (8+ characters)" className={input} />
          <label htmlFor="confirm" className="sr-only">Type it again</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} placeholder="Type it again" className={input} />
          <Button type="submit">{u?.has_pw ? "Change password" : "Set password"}</Button>
        </form>
      </Card>

      {(me.isParent || me.athleteId) && plusForSale ? (
        <Link href="/plus" className="flex min-h-14 items-center justify-between rounded-[14px] border border-gold/60 bg-gold/5 px-4">
          <span><span className="block font-semibold">ProLyt+</span><span className="block text-[12px] text-muted">Recruiting alerts and insights, video uploads</span></span>
          <span className="text-gold">→</span>
        </Link>
      ) : null}

      <p className="text-[13px] text-muted">{u?.passkeys ? `Face ID / passkey is on for ${u.passkeys} device${u.passkeys === 1 ? "" : "s"}.` : "Tip: turn on Face ID from the banner on your home screen for one-tap sign-in."}</p>
      <EnablePush why="for messages, check-in and your teams' games." />
      <form action={signOut}><Button kind="ghost">Sign out</Button></form>
    </>
  );
}
