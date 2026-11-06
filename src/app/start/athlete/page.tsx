import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { Kicker } from "@/components/ui";
import { ProLytMark } from "@/components/brand";
import { StartForm } from "./form";

export const metadata = { title: "Create your athlete profile" };

export default async function StartAthlete() {
  const me = await requireMe();
  if (me.athleteId) redirect(`/athlete/${me.athleteId}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <Link href="/start" className="text-sm font-semibold">← Back</Link>
      <ProLytMark className="text-3xl" />
      <div>
        <Kicker>Free, forever</Kicker>
        <h1 className="mt-1 font-display text-[40px] uppercase leading-none">Your athlete profile</h1>
        <p className="mt-2 text-sm text-soft">Your film, your verified numbers and every team you play for, in one place that goes with you.</p>
      </div>
      <StartForm />
    </main>
  );
}
