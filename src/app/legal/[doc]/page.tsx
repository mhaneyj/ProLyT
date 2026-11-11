import Link from "next/link";
import { notFound } from "next/navigation";
import { brandBySlug, currentOrgSlug } from "@/lib/org";
import { LEGAL, LEGAL_UPDATED } from "@/lib/legal";

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  return { title: LEGAL[(await params).doc]?.title ?? "Legal" };
}

export default async function LegalDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL[doc];
  if (!d) notFound();
  const brand = await brandBySlug(await currentOrgSlug());
  const email = process.env.SUPPORT_EMAIL;
  const fill = (s: string) => s.replaceAll("{program}", brand?.name ?? "your program").replaceAll("{contact}", email ? email : "ask your coach, or use Account in the app");
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-6">
      <Link href="/register" className="min-h-11 py-3 text-sm font-semibold">← Back</Link>
      <h1 className="font-display text-[32px] uppercase leading-none">{d.title}</h1>
      <p className="text-[12px] text-muted">Last updated {LEGAL_UPDATED}</p>
      <p className="text-[15px] leading-relaxed text-soft">{fill(d.intro)}</p>
      {d.sections.map((s) => (
        <section key={s.h} className="flex flex-col gap-2">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">{s.h}</h2>
          {s.p?.map((t, i) => <p key={i} className="text-[15px] leading-relaxed text-soft">{fill(t)}</p>)}
          {s.list ? <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-soft">{s.list.map((t, i) => <li key={i}>{fill(t)}</li>)}</ul> : null}
        </section>
      ))}
      <nav aria-label="Other documents" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
        {Object.entries(LEGAL).filter(([k]) => k !== doc).map(([k, v]) => <Link key={k} href={`/legal/${k}`} className="min-h-11 py-2 font-semibold text-gold">{v.title}</Link>)}
      </nav>
    </main>
  );
}
