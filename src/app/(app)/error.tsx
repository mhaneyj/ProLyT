"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Something broke on a page. Offer a retry and a one-tap report that carries the error id. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname();
  const ref = error.digest ?? "client";
  return (
    <div className="flex flex-col gap-3 py-6">
      <h1 className="font-display text-[30px] uppercase leading-none">Something went wrong</h1>
      <p className="text-sm text-soft">That&apos;s on us, not you. Try again, and if it keeps happening, tell us. We get the technical details automatically.</p>
      <button onClick={reset} className="min-h-12 rounded-md bg-gold font-bold text-on-gold">Try again</button>
      <Link href={`/help?kind=bug&ref=${encodeURIComponent(ref)}&from=${encodeURIComponent(path ?? "")}`} className="flex min-h-12 items-center justify-center rounded-md border-2 border-[#3a3a3a] font-bold hover:border-gold">Report this problem</Link>
    </div>
  );
}
