"use client";
import { useActionState } from "react";
import { saveProfile, type ProfileState } from "../actions";
import { METRICS, SHOWCASE_ORDER } from "@/lib/domain/metrics";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const label = "mb-1.5 block text-sm text-soft";
const SPORTS = ["Football", "Basketball", "Baseball", "Softball", "Soccer", "Volleyball", "Track and field", "Lacrosse", "Wrestling", "Flag football", "Other"];
const THEMES = [["#F8C40A", "Gold"], ["#E03A3E", "Red"], ["#2F80ED", "Blue"], ["#27AE60", "Green"], ["#9B51E0", "Purple"], ["#F2994A", "Orange"], ["#E0E0E0", "Silver"]];

export type ProfileValues = {
  athlete: string; position: string; grad_year: string; sport: string; hometown: string; school: string; bio: string;
  highlight_url: string; gpa: string; intended_major: string; show_academics: boolean; theme_color: string; gender: string; height: string; weight: string; wingspan: string; featured: string[]; has: string[];
};

export function ProfileForm({ v }: { v: ProfileValues }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const sport = SPORTS.find((s) => s.toLowerCase() === v.sport.toLowerCase()) ?? "Other";
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="athlete" value={v.athlete} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Athlete</legend>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="sport" className={label}>Sport</label><select id="sport" name="sport" defaultValue={sport} className={input}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label htmlFor="position" className={label}>Position</label><input id="position" name="position" defaultValue={v.position} className={input} /></div>
        </div>
        <div><label htmlFor="gender" className={label}>Plays in</label>
          <select id="gender" name="gender" defaultValue={v.gender} className={input}><option value="">Not set</option><option value="male">Boys / open divisions</option><option value="female">Girls divisions</option></select>
          <p className="mt-1 text-xs text-muted">Used only to check tournament division rules.</p></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label htmlFor="grad_year" className={label}>Class of</label><input id="grad_year" name="grad_year" inputMode="numeric" defaultValue={v.grad_year} className={input} /></div>
          <div><label htmlFor="height" className={label}>Height (in)</label><input id="height" name="height" inputMode="decimal" defaultValue={v.height} placeholder="72" className={input} /></div>
          <div><label htmlFor="weight" className={label}>Weight (lb)</label><input id="weight" name="weight" inputMode="numeric" defaultValue={v.weight} placeholder="185" className={input} /></div>
        </div>
        <div><label htmlFor="wingspan" className={label}>Wingspan (in)</label><input id="wingspan" name="wingspan" inputMode="decimal" defaultValue={v.wingspan} placeholder="76" className={input} /></div>
        <p className="-mt-1 text-xs text-muted">Height, weight and wingspan you enter show as self-reported until a coach measures them.</p>
        <div><label htmlFor="hometown" className={label}>Hometown</label><input id="hometown" name="hometown" defaultValue={v.hometown} placeholder="Loomis, CA" className={input} /></div>
        <div>
          <label htmlFor="bio" className={label}>Bio</label>
          <textarea id="bio" name="bio" rows={3} maxLength={400} defaultValue={v.bio} placeholder="What kind of player are you? What are you working on?" className={`${input} py-2`} />
        </div>
        <div>
          <label htmlFor="highlight_url" className={label}>Highlight reel link</label>
          <input id="highlight_url" name="highlight_url" type="url" defaultValue={v.highlight_url} placeholder="https://youtu.be/… or Hudl" className={input} />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">School</legend>
        <div><label htmlFor="school" className={label}>School</label><input id="school" name="school" defaultValue={v.school} className={input} /></div>
        <p className="-mt-1 text-xs text-muted">Only your programs&apos; coaches see your school. It&apos;s never on your public link.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="gpa" className={label}>GPA</label><input id="gpa" name="gpa" inputMode="decimal" defaultValue={v.gpa} placeholder="3.6" className={input} /></div>
          <div><label htmlFor="intended_major" className={label}>Intended major</label><input id="intended_major" name="intended_major" defaultValue={v.intended_major} className={input} /></div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-soft">
          <input type="checkbox" name="show_academics" defaultChecked={v.show_academics} className="size-5 accent-[var(--color-gold)]" />
          Show GPA and major on my recruiting link
        </label>
      </fieldset>
      <fieldset id="featured" className="scroll-mt-4">
        <legend className="mb-1 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Featured stats</legend>
        <p className="mb-2 text-xs text-muted">Pick up to 4 to show big at the top. The first one gets the spotlight. Leave all off and we feature the best ones, speed first.</p>
        <div className="flex flex-wrap gap-2">
          {SHOWCASE_ORDER.map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="checkbox" name="featured" value={k} defaultChecked={v.featured.includes(k)} className="peer sr-only"
                onChange={(e) => { const f = e.currentTarget.form; if (f && f.querySelectorAll('input[name="featured"]:checked').length > 4) { e.currentTarget.checked = false; } }} />
              <span className={`flex min-h-11 items-center rounded-full border border-line px-3 text-sm peer-checked:border-2 peer-checked:border-gold peer-checked:text-gold peer-focus-visible:outline-2 ${v.has.includes(k) ? "" : "opacity-60"}`}>
                {METRICS[k].short}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Profile color</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map(([hex, name]) => (
            <label key={hex} className="cursor-pointer">
              <input type="radio" name="theme_color" value={hex} defaultChecked={(v.theme_color || "#F8C40A").toUpperCase() === hex} className="peer sr-only" />
              <span className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm peer-checked:border-2 peer-checked:border-cream peer-focus-visible:outline-2">
                <span aria-hidden="true" className="size-4 rounded-full" style={{ background: hex }} />{name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm">{state.error}</div> : null}
      <button disabled={pending} className="min-h-14 w-full rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
