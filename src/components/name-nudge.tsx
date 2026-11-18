import { laterName, setMyName } from "@/app/name-action";

/** Shown until the person has a name: everyone else sees it on rosters, messages and event staff lists. Kept to one short row so it never pushes the page down. */
export function NameNudge() {
  return (
    <form action={setMyName} className="flex flex-col gap-1 rounded-[14px] border border-gold/60 bg-gold/5 px-3 py-2">
      <label htmlFor="my-name" className="text-[13px] font-semibold">Add your name <span className="font-normal text-soft">so coaches and families don&apos;t see your email</span></label>
      <div className="flex gap-2">
        <input id="my-name" name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="First and last name"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-[16px] text-cream" />
        <button className="min-h-11 rounded-md bg-gold px-4 font-bold text-on-gold">Save</button>
        <button formAction={laterName} formNoValidate aria-label="Not now" className="min-h-11 min-w-11 rounded-md text-lg text-muted hover:text-cream">✕</button>
      </div>
    </form>
  );
}
