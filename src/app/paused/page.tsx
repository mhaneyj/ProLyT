import { signOut } from "@/app/sign-out";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { ProLytMark } from "@/components/brand";

export const metadata = { title: "Program paused" };

export default async function Paused() {
  const brand = await brandBySlug(await currentOrgSlug());
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
      <ProLytMark className="text-3xl" />
      <h1 className="font-display text-[40px] uppercase leading-none">{brand?.name ?? "This program"} is paused</h1>
      <p className="text-soft">The app is turned off for this program for now. Your athlete&apos;s records are safe. Contact the program if you have questions.</p>
      <form action={signOut}><button className="min-h-11 text-sm font-semibold text-muted">Sign out</button></form>
    </main>
  );
}
