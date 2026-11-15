"use client";
import Link from "next/link";
import { useState } from "react";

type Reply = { answer: string; topics: { id: string; title: string; href?: string }[]; source: "bot" | "guide" };
type Msg = { role: "user" | "assistant"; content: string; topics?: Reply["topics"] };

export function AskBox({ suggestions }: { suggestions: string[] }) {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(text: string) {
    const question = text.trim();
    if (question.length < 3 || busy) return;
    setErr(""); setBusy(true); setQ("");
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
      setMsgs((m) => [...m, { role: "assistant", content: (j as Reply).answer, topics: (j as Reply).topics }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="Ask ProLyt" className="flex flex-col gap-3 rounded-[16px] border border-gold/40 bg-gold/[0.05] p-4">
      <div>
        <h2 className="font-display text-[22px] uppercase leading-none">Ask ProLyt</h2>
        <p className="mt-1 text-[13px] text-muted">Answers from this guide. It can&apos;t see your account, so don&apos;t type names, payment or password details.</p>
      </div>
      {!msgs.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="min-h-11 rounded-full border border-line bg-panel px-3 text-left text-[13px] font-semibold hover:border-gold">{s}</button>)}
        </div>
      ) : null}
      <div aria-live="polite" className="flex flex-col gap-2">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end rounded-2xl rounded-br-sm bg-gold px-3 py-2 text-sm font-semibold text-on-gold" : "rounded-2xl rounded-bl-sm border border-line bg-panel px-3 py-2 text-sm"}>
            <p className="whitespace-pre-line">{m.content}</p>
            {m.topics?.length ? <div className="mt-2 flex flex-wrap gap-2">{m.topics.map((t) => t.href ? <Link key={t.id} href={t.href} className="inline-flex min-h-9 items-center rounded-full border border-gold px-3 text-[12px] font-bold text-gold">{t.title} →</Link> : <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-[12px] font-bold text-soft">{t.title}</a>)}</div> : null}
          </div>
        ))}
        {busy ? <p className="text-sm text-muted">Looking that up…</p> : null}
        {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} aria-label="Your question" placeholder="How do I…?" className="min-h-12 min-w-0 flex-1 rounded-md border border-line bg-panel px-3 text-sm" />
        <button disabled={busy || q.trim().length < 3} className="min-h-12 rounded-md bg-gold px-4 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold disabled:opacity-40">Ask</button>
      </form>
      {msgs.length ? <p className="text-[12px] text-muted">Not what you needed? <Link href="/help" className="font-semibold text-gold">Send it to the team</Link>.</p> : null}
    </section>
  );
}
