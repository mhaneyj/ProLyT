import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asService } from "@/lib/db";
import { shareHash } from "@/lib/share";
import { METRICS, SOURCE_LABEL, bestOfficial, formatValue, metricShort, type Source } from "@/lib/domain/metrics";
import { shortDate } from "@/lib/domain/format";
import { Player } from "@/components/player";
import { ProLytMark } from "@/components/brand";

type P = {
  first_name: string; last_name: string; position: string | null; grad_year: number | null; attended: number;
  programs: { name: string }[];
  results: { metric: string; value: number; source: Source; recorded_at: string; org: string | null }[];
  highlights: { title: string; url: string; kind: string }[];
};

// Public, parent-approved page. Not indexed by search engines.
export const metadata: Metadata = { title: "Recruiting profile", robots: { index: false, follow: false } };

async function load(token: string): Promise<P | null> {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  const [row] = await asService((q) => q<{ p: P | null }>("select public_profile($1) p", [shareHash(token)]));
  return row?.p ?? null;
}

export default async function PublicProfile({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await load(token);
  if (!p) notFound();
  const metrics = Object.keys(METRICS).filter((m) => p.results.some((r) => r.metric === m));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="relative overflow-hidden rounded-[14px] border border-line p-5"
        style={{ background: "radial-gradient(120% 90% at 100% 0%, rgba(248,196,10,0.35), transparent 60%), linear-gradient(160deg, #1b1b1b, #0b0b0b)" }}>
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{p.programs.map((x) => x.name).join(" · ") || "Athlete"}</div>
        <h1 className="mt-1 font-display text-[44px] uppercase leading-none">{p.first_name} {p.last_name}</h1>
        <div className="mt-2 text-soft">{[p.position, p.grad_year ? `Class of ${p.grad_year}` : null].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 text-xs text-muted">{p.attended} training session{Number(p.attended) === 1 ? "" : "s"} attended</div>
      </div>

      {metrics.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Testing</h2>
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((m) => {
              const rows = p.results.filter((r) => r.metric === m);
              const best = bestOfficial(m, rows)!;
              const top = rows.find((r) => Number(r.value) === best)!;
              return (
                <div key={m} className="rounded-[10px] border border-line bg-panel p-3">
                  <div className="text-[11px] uppercase tracking-[1px] text-muted">{metricShort(m)}</div>
                  <div className="tabular font-display text-[28px] leading-tight">{formatValue(m, best)}</div>
                  <div className={`text-[11px] font-semibold ${top.source === "verified_event" ? "text-good" : "text-gold"}`}>
                    {SOURCE_LABEL[top.source]} · {shortDate(top.recorded_at)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">Verified results are from timed testing events. Coach-logged results are recorded by the athlete&apos;s program coaches. Self-reported numbers are never shown.</p>
        </section>
      ) : null}

      {p.highlights.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Highlights</h2>
          {p.highlights.map((h, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Player id="" storagePath={h.url} title={h.title} />
              <div className="text-sm font-semibold">{h.title} <span className="font-normal text-muted">· {h.kind === "game" ? "Game" : "Training"}</span></div>
            </div>
          ))}
        </section>
      ) : null}

      <p className="text-xs text-muted">Shared by the athlete&apos;s parent. To get in touch, reply to whoever sent you this link.</p>
      <div className="mt-auto flex items-center justify-center gap-2 text-xs text-muted">Powered by <ProLytMark className="text-sm" /></div>
    </main>
  );
}
