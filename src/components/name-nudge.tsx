import { setMyName } from "@/app/name-action";

/** Shown until the person has a name: everyone else sees it on rosters, messages and event staff lists. */
export function NameNudge() {
  return (
    <form action={setMyName} className="flex flex-col gap-2 rounded-[14px] border-2 border-gold bg-gold/5 p-4">
      <label htmlFor="my-name" className="font-semibold">What&apos;s your name?</label>
      <p className="-mt-1 text-[13px] text-soft">Coaches and families see it instead of your email.</p>
      <div className="flex gap-2">
        <input id="my-name" name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="First and last name"
          className="min-h-12 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
        <button className="min-h-12 rounded-md bg-gold px-4 font-bold text-on-gold">Save name</button>
      </div>
    </form>
  );
}
