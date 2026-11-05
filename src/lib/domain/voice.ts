// Turns what a coach says ("Jordan five two one, Ty five oh four. Jordan hands inside,
// next focus staying low") into results and notes to confirm before saving.
import { METRICS, BOUNDS } from "./metrics";

export type RosterName = { id: string; first: string; last: string };
export type Parsed = { athleteId: string; name: string; value: number | null; heard: string; note: string | null; focus: string | null };

const ONES: Record<string, number> = {
  zero: 0, oh: 0, o: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Word list → tokens where spoken numbers become digit strings ("twenty four" → "24", "point" → "."). */
function numberize(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d+(\.\d+)?$/.test(w)) { out.push(w); continue; }
    if (w in TENS) {
      const next = words[i + 1];
      if (next && next in ONES && ONES[next] > 0 && ONES[next] < 10) { out.push(String(TENS[w] + ONES[next])); i++; }
      else out.push(String(TENS[w]));
      continue;
    }
    if (w === "hundred" && out.length && /^\d$/.test(out.at(-1)!)) {
      // "three hundred fifteen" → 315
      const h = Number(out.pop()) * 100;
      const rest: string[] = [];
      let j = i + 1;
      while (j < words.length && (words[j] in TENS || (words[j] in ONES && words[j] !== "o")) && rest.length < 2) rest.push(words[j++]);
      const tail = numberize(rest).reduce((a, b) => a + Number(b), 0);
      out.push(String(h + tail));
      i = j - 1;
      continue;
    }
    if (w in ONES) { out.push(String(ONES[w])); continue; }
    if (w === "point" || w === "dot") { out.push("."); continue; }
    if (w === "half" && words[i - 1] === "a" && words[i - 2] === "and") { out.push("+.5"); continue; }
    out.push(w);
  }
  return out;
}

/** Reads the number for one test out of the tokens spoken after a name. */
export function readValue(metric: string, tokens: string[]): { value: number | null; used: number } {
  const m = METRICS[metric];
  let i = 0;
  // "forty ..." / "40 ..." names the test for the 40-yard dash, not the time.
  if (metric === "40yd" && (tokens[0] === "40" || tokens[0] === "forty") && /^\d|\./.test(tokens[1] ?? "")) i = 1;
  const nums: string[] = [];
  while (i < tokens.length && (/^\d+(\.\d+)?$/.test(tokens[i]) || tokens[i] === "." || tokens[i] === "+.5" || ["and", "a"].includes(tokens[i]) && tokens.slice(i).includes("+.5"))) {
    if (!["and", "a"].includes(tokens[i])) nums.push(tokens[i]);
    i++;
  }
  if (!nums.length) return { value: null, used: 0 };
  let value: number;
  const half = nums.includes("+.5") ? 0.5 : 0;
  const digits = nums.filter((n) => n !== "+.5");
  const dot = digits.indexOf(".");
  if (digits.length === 1) value = Number(digits[0]);
  else if (dot > 0) value = Number(`${digits.slice(0, dot).join("")}.${digits.slice(dot + 1).join("")}`);
  else if (m && m.decimals > 0) value = Number(`${digits[0]}.${digits.slice(1).join("")}`); // "five two one" → 5.21
  else value = Number(digits.join("")); // "three fifteen" → 315
  value += half;
  if (m && m.decimals > 0 && digits.length === 1 && !digits[0].includes(".")) {
    // "five twenty one" arrives as 5, 21 above; a lone "521" means 5.21 for timed tests
    const [lo, hi] = BOUNDS[metric] ?? [0, Infinity];
    if (value > hi && value < hi * 1000) for (const d of [100, 10, 1000]) if (value / d >= lo && value / d <= hi) { value = value / d; break; }
  }
  return { value: Number.isFinite(value) ? Number(value.toFixed(m?.decimals ?? 2)) : null, used: i };
}

export function parseSpoken(transcript: string, roster: RosterName[], metric: string): { items: Parsed[]; leftover: string } {
  const words = transcript.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9.\s]/g, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ").split(/\s+/).filter(Boolean);
  const firstCount = new Map<string, number>();
  for (const r of roster) firstCount.set(r.first.toLowerCase(), (firstCount.get(r.first.toLowerCase()) ?? 0) + 1);

  // Find where each athlete is named.
  const hits: { at: number; len: number; r: RosterName }[] = [];
  for (let i = 0; i < words.length; i++) {
    for (const r of roster) {
      const f = r.first.toLowerCase(), l = r.last.toLowerCase();
      if (words[i] === f && words[i + 1] === l) { hits.push({ at: i, len: 2, r }); break; }
      if (words[i] === f && firstCount.get(f) === 1) { hits.push({ at: i, len: words[i + 1] === l ? 2 : 1, r }); break; }
      if (words[i] === f && words[i + 1]?.[0] === l[0] && words[i + 1].length === 1) { hits.push({ at: i, len: 2, r }); break; }
    }
  }
  const items: Parsed[] = [];
  const byAthlete = new Map<string, Parsed>();
  const leftover: string[] = words.slice(0, hits[0]?.at ?? words.length);
  hits.forEach((h, k) => {
    const seg = words.slice(h.at + h.len, hits[k + 1]?.at ?? words.length);
    // "Jordan forty, five two one" / "forty yard five two one": the test's name, not the time
    let start = 0;
    if (metric === "40yd" && (seg[0] === "forty" || seg[0] === "40")) start = ["yard", "yd", "dash"].includes(seg[1]) ? 2 : 1;
    while (["yard", "dash"].includes(seg[start])) start++;
    const tokens = numberize(seg.slice(start));
    const { value, used } = readValue(metric, tokens);
    const rest = tokens.slice(used).join(" ").replace(/\+\.5/g, "and a half").trim();
    let note: string | null = null, focus: string | null = null;
    if (rest.split(" ").length >= 2) {
      const fx = rest.match(/(.*?)(?:\b(?:next focus|focus on|work on|next)\b\s*(?:is\s+)?)(.+)$/);
      note = (fx ? fx[1] : rest).trim() || null;
      focus = fx ? fx[2].trim() : null;
      if (note) note = note[0].toUpperCase() + note.slice(1);
    }
    const existing = byAthlete.get(h.r.id);
    if (existing) {
      if (existing.value === null && value !== null) { existing.value = value; existing.heard += ` ${seg.join(" ")}`; }
      existing.note = existing.note ?? note;
      existing.focus = existing.focus ?? focus;
      return;
    }
    const p: Parsed = { athleteId: h.r.id, name: `${h.r.first} ${h.r.last}`, value, heard: seg.join(" "), note, focus };
    byAthlete.set(h.r.id, p);
    items.push(p);
  });
  return { items, leftover: leftover.join(" ") };
}
