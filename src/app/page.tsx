import Image from "next/image";
import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";
import { Kicker, LinkButton } from "@/components/ui";

export default async function Welcome() {
  const me = await getMe();
  if (me) redirect(homeFor(me));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Image src="/logo.png" alt="Game-Fit Loomis" width={140} height={108} priority />
      <div className="mt-auto flex flex-col gap-4 pb-4">
        <Kicker>Game-Fit Loomis · Athlete portal</Kicker>
        <h1 className="font-display text-[52px] uppercase leading-[0.95]">
          Win your rep.
          <br />
          <span className="text-gold">Win your position.</span>
        </h1>
        <p className="text-soft">Schedules, verified progress, film and monthly reports for every athlete, in one place for families and coaches.</p>
        <LinkButton href="/login">Sign in</LinkButton>
        <LinkButton href="/register" kind="ghost">Register an athlete</LinkButton>
      </div>
    </main>
  );
}
