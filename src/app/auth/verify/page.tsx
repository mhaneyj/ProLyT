import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db";
import { consumeLink, SESSION_DAYS } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/auth";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { themeVars } from "@/lib/domain/brand";
import { Button, Kicker } from "@/components/ui";
import { ProgramLogo, ProLytMark } from "@/components/brand";

export const metadata = { title: "Sign in" };

// The link opens this page and the person taps a button to finish. Using a
// button (not signing in on page load) stops email scanners that open links
// automatically from using up the one-time link.
async function finish(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").filter(Boolean);
  const result = await asService((q) => consumeLink(q, token, admins));
  if (!result) redirect("/login?error=" + encodeURIComponent("That link expired or was already used. Send a new one."));
  const proto = ((await headers()).get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  (await cookies()).set(SESSION_COOKIE, result.session, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect("/home");
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/login");
  const brand = await brandBySlug(await currentOrgSlug());
  return (
    <main style={brand ? (themeVars(brand.brand_color) as React.CSSProperties) : undefined} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      {brand ? <ProgramLogo brand={brand} size={80} /> : <ProLytMark className="text-4xl" />}
      <div>
        <Kicker>{brand ? brand.name : "ProLyt"}</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Almost in</h1>
      </div>
      <form action={finish}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit">Finish signing in</Button>
      </form>
    </main>
  );
}
