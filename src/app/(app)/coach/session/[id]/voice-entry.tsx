"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { parseSpoken, type Parsed } from "@/lib/domain/voice";
import { METRICS, formatValue } from "@/lib/domain/metrics";
import { Icon } from "@/components/icons";
import { saveVoice } from "./actions";

type Athlete = { id: string; first: string; last: string; best: number | null };

// Minimal typing for the browser's speech recognition (Chrome, Safari).
type Rec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

export function VoiceEntry({ session, metric, athletes }: { session: string; metric: string; athletes: Athlete[] }) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<Parsed>>>({});
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const rec = useRef<Rec | null>(null);
  const m = METRICS[metric];

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setSupported(!!(W.SpeechRecognition ?? W.webkitSpeechRecognition));
  }, []);

  const parsed = useMemo(() => parseSpoken(text, athletes.map(({ id, first, last }) => ({ id, first, last })), metric).items
    .map((p) => ({ ...p, ...edits[p.athleteId] })), [text, athletes, metric, edits]);

  function listen() {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new C();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let fin = "", mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript + " "; else mid += res[0].transcript;
      }
      if (fin) setText((t) => (t ? `${t.trim()} ` : "") + fin.trim());
      setInterim(mid);
    };
    r.onend = () => { setListening(false); setInterim(""); };
    r.onerror = (e) => { setListening(false); if (e.error === "not-allowed") setMsg({ error: "Allow the microphone for this site, or type below." }); };
    rec.current = r;
    setMsg({});
    r.start();
    setListening(true);
  }

  function save() {
    setMsg({});
    start(async () => {
      const r = await saveVoice({ session, metric, items: parsed.map((p) => ({ athleteId: p.athleteId, value: p.value ?? null, note: p.note ?? null, focus: p.focus ?? null })) });
      setMsg(r);
      if (r.ok) { setText(""); setEdits({}); }
    });
  }

  const isPR = (p: Parsed) => {
    const best = athletes.find((a) => a.id === p.athleteId)?.best;
    if (p.value == null) return false;
    if (best == null) return false;
    return m.lowerIsBetter ? p.value < best : p.value > best;
  };

  return (
    <div className="flex flex-col gap-3">
      {supported ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <button type="button" onClick={listen} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start talking"}
            className={`grid size-24 place-items-center rounded-full ${listening ? "animate-pulse bg-bad" : "bg-gold"} text-on-gold shadow-[0_0_0_8px_rgba(248,196,10,0.12)]`}>
            <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {listening ? <rect x="7" y="7" width="10" height="10" rx="1.5" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
            </svg>
          </button>
          <div className="font-semibold">{listening ? "Listening… tap to stop" : "Tap and talk"}</div>
          <p className="max-w-xs text-xs text-muted">Say names, numbers and notes the way you would to another coach: &ldquo;Jordan five two one, Ty five oh four. Jordan, hands inside, next focus staying low.&rdquo;</p>
        </div>
      ) : (
        <p className="text-xs text-muted">Tap the box, then the 🎤 on your keyboard, and talk: &ldquo;Jordan five two one, Ty five oh four. Jordan, hands inside, next focus staying low.&rdquo;</p>
      )}

      <label htmlFor="voice-text" className="sr-only">What you said</label>
      <textarea id="voice-text" rows={3} value={text + (interim ? ` ${interim}` : "")} onChange={(e) => { setText(e.target.value); setMsg({}); }}
        placeholder="What you said shows here. You can fix words too."
        className="rounded-md border border-[#333] bg-[#111] p-3 text-[15px] italic text-soft" />

      {parsed.length ? (
        <div className="flex flex-col gap-2">
          <div className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-gold">Check before saving</div>
          {parsed.map((p) => (
            <div key={p.athleteId} className="rounded-[10px] border border-line bg-panel px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted">{p.value != null ? m.label : "Note only"}</div>
                </div>
                {isPR(p) ? <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-on-gold">PR</span> : null}
                <label className="sr-only" htmlFor={`v-${p.athleteId}`}>{p.name} {m.label}</label>
                <input id={`v-${p.athleteId}`} inputMode="decimal" value={p.value ?? ""} placeholder="—"
                  onChange={(e) => setEdits((x) => ({ ...x, [p.athleteId]: { ...x[p.athleteId], value: e.target.value === "" ? null : Number(e.target.value) } }))}
                  className="tabular min-h-11 w-24 rounded-md border border-[#333] bg-[#111] px-2 text-right font-display text-xl" />
              </div>
              {p.note ? (
                <div className="mt-2 text-sm">
                  <span className="text-soft">{p.note}</span>
                  {p.focus ? <span className="block text-[13px] font-semibold text-gold">Next focus: {p.focus}</span> : null}
                </div>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-muted">Missing someone? Say their name again, or use Quick entry. Best so far: {athletes.filter((a) => a.best != null).slice(0, 3).map((a) => `${a.first} ${formatValue(metric, a.best!)}`).join(" · ") || "none yet"}.</p>
        </div>
      ) : text.trim() ? <p className="text-sm text-warn">I didn&apos;t catch a name from this session&apos;s roster. Start each one with a name.</p> : null}

      {msg.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm">{msg.error}</div> : null}
      {msg.ok ? <div role="status" className="rounded-lg border border-good p-3 text-sm text-good">{msg.ok}</div> : null}
      <button type="button" onClick={save} disabled={pending || !parsed.length}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-40">
        <Icon name="check" size={20} />{pending ? "Saving…" : `Save ${parsed.length || ""}`.trim()}
      </button>
    </div>
  );
}
