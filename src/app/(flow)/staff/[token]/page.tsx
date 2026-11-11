import { meOrSignIn } from "@/lib/flow";
import { asService } from "@/lib/db";
import { joinStaff } from "@/app/(app)/day/actions";
import { Notice } from "@/components/ui";

export const metadata = { title: "Event staff" };

export default async function Staff({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const ok = /^[A-Za-z0-9_-]{32,80}$/.test(token);
  await meOrSignIn(`/staff/${token}`);
  const [e] = ok ? await asService((q) => q<{ name: string; host: string }>(
    "select e.name, o.name host from events e join orgs o on o.id = e.org_id where e.staff_token = $1 and e.status in ('open','closed','live')", [token])) : [];
  if (!e) return <><h1 className="font-display text-[30px] uppercase">Link not working</h1><p className="text-soft">This staff link was replaced or the event is over. Ask the host for the current link.</p></>;
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Help run {e.name}</h1>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <p className="text-soft">{e.host} invited you to work the event: check athletes in by scanning their passes and keep score on your field.</p>
      <form action={joinStaff}><input type="hidden" name="token" value={token} />
        <button className="min-h-14 w-full rounded-md bg-gold text-lg font-bold text-on-gold">Join event staff</button></form>
      <p className="text-[12px] text-muted">You&apos;ll see athletes&apos; names, photos, teams and eligibility for this event only. The host can remove you anytime.</p>
    </>
  );
}
