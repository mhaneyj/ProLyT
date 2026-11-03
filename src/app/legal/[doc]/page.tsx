import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui";

const DOCS: Record<string, string> = {
  participation: "Participation terms",
  waiver: "Liability waiver",
  privacy: "Family privacy notice",
};

export default async function LegalDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const title = DOCS[doc];
  if (!title) notFound();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-6">
      <Link href="/register" className="text-sm font-semibold">← Back</Link>
      <h1 className="font-display text-[32px] uppercase leading-none">{title}</h1>
      <Notice>Placeholder. The final text comes from the program&apos;s attorney before launch. Registration stays in demo mode until it&apos;s in place.</Notice>
    </main>
  );
}
