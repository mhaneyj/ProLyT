import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMe, DEMO_COOKIE } from "@/lib/auth";
import { isDemo } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav";

async function signOut() {
  "use server";
  if (isDemo) (await cookies()).delete(DEMO_COOKIE);
  else await (await supabaseServer()).auth.signOut();
  redirect("/");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const items: { href: string; label: string }[] = [];
  if (me.roles.includes("owner")) items.push({ href: "/owner", label: "Dashboard" });
  if (me.roles.includes("coach")) items.push({ href: "/coach", label: "Today" }, { href: "/coach/earnings", label: "Earnings" });
  if (me.roles.includes("guardian")) items.push({ href: "/family", label: "Home" });
  items.push({ href: "/schedule", label: "Schedule" });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-5 pt-4">
        <Link href="/" className="font-cond text-sm font-extrabold uppercase tracking-[3px] text-muted">
          Game-Fit <span className="text-gold">Loomis</span>
        </Link>
        <form action={signOut}>
          <button className="min-h-11 px-2 text-xs text-muted hover:text-cream">
            {me.name} · Sign out
          </button>
        </form>
      </header>
      {isDemo ? <div className="mx-5 mt-2 rounded bg-gold/10 px-3 py-1 text-center text-[11px] text-gold">Demo mode · sample data</div> : null}
      <main className="flex flex-1 flex-col gap-4 px-5 pb-28 pt-4">{children}</main>
      <NavLinks items={items} />
    </div>
  );
}
