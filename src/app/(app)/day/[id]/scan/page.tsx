import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { PassScanner } from "@/components/pass-scanner";

export const metadata = { title: "Scan passes" };

export default async function Scan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const me = await requireMe();
  const [ok] = await asUser(me.id, (q) => q<{ staff: boolean }>("select is_event_staff($1) staff", [id]));
  if (!ok?.staff) notFound();
  return (
    <>
      <Link href={`/day/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Check-in desk</Link>
      <h1 className="font-display text-[30px] uppercase leading-none">Scan a pass</h1>
      <PassScanner />
    </>
  );
}
