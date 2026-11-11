import Link from "next/link";
import { ProLytMark } from "@/components/brand";

// Pages people reach from a shared link (team sign-ups): no app chrome, and they handle sign-in themselves
// so the person comes straight back to the same link after signing in.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-6">
      <Link href="/home" className="w-fit"><ProLytMark /></Link>
      {children}
    </main>
  );
}
