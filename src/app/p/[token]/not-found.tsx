import { ProLytMark } from "@/components/brand";

export default function ProfileLinkOff() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
      <ProLytMark className="text-3xl" />
      <h1 className="font-display text-[40px] uppercase leading-none">This link isn&apos;t active</h1>
      <p className="text-soft">The family may have turned it off or sent a newer one. Ask them for the current link.</p>
    </main>
  );
}
