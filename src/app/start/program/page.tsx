import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { ProLytMark } from "@/components/brand";
import { Kicker } from "@/components/ui";
import { StartProgramForm } from "./form";

export const metadata = { title: "Start a program" };

export default async function StartProgram() {
  const me = await getMe();
  if (!me) redirect("/login?next=/start/program");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <ProLytMark className="text-4xl" />
      <div>
        <Kicker>Start a program</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Set up your program</h1>
        <p className="mt-2 text-soft">Two minutes. You&apos;ll get your own link for families, a schedule, rosters, and player profiles. Payments turn on when you connect your bank through Stripe.</p>
      </div>
      <StartProgramForm />
      <p className="text-xs text-muted">Next you&apos;ll sign in once more on your program&apos;s own address, then add your plans and invite coaches.</p>
    </main>
  );
}
