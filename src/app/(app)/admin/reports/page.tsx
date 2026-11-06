import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Empty, Pill } from "@/components/ui";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Safety · ProLyt admin" };

type R = { id: string; reason: string; created_at: string; resolved_at: string | null; body: string; sender: string; reporter: string; program: string; thread_kind: string; message_hidden: boolean };

async function resolve(form: FormData) {
  "use server";
  const me = await requirePlatformAdmin();
  const id = String(form.get("id"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await asUser(me.id, (q) => q("select admin_resolve_report($1, $2)", [id, form.get("hide") === "1"]));
  revalidatePath("/admin/reports");
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const me = await requirePlatformAdmin();
  const rows = await asUser(me.id, (q) => q<R>("select * from admin_reports($1)", [!done]));
  const when = (d: string) => new Date(d).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Safety</h1>
      <AdminTabs on="reports" />
      <div className="flex gap-3 text-sm">
        <a href="/admin/reports" className={!done ? "font-bold text-gold" : "text-muted"}>Open</a>
        <a href="/admin/reports?done=1" className={done ? "font-bold text-gold" : "text-muted"}>Resolved</a>
      </div>
      {rows.length === 0 ? <Empty title={done ? "Nothing resolved yet" : "No open reports"}>Reported messages land here for review.</Empty> : null}
      {rows.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>{r.program} · {r.thread_kind}</span><span>{when(r.created_at)}</span>
          </div>
          <blockquote className="mt-2 whitespace-pre-wrap rounded-lg border-l-2 border-bad bg-black/30 px-3 py-2 text-[15px]">{r.body}</blockquote>
          <div className="mt-2 text-[13px]"><span className="text-muted">Sent by</span> {r.sender}</div>
          <div className="text-[13px]"><span className="text-muted">Reported by</span> {r.reporter}: “{r.reason}”</div>
          {r.message_hidden ? <div className="mt-2"><Pill>Hidden</Pill></div> : null}
          {!r.resolved_at ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <form action={resolve}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="hide" value="1" />
                <button className="min-h-11 w-full rounded-md bg-bad font-semibold text-ink">Hide message</button></form>
              <form action={resolve}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="hide" value="0" />
                <button className="min-h-11 w-full rounded-md border border-line font-semibold">No action</button></form>
            </div>
          ) : <div className="mt-2 text-xs text-muted">Resolved {when(r.resolved_at)}</div>}
        </Card>
      ))}
      <p className="text-xs text-muted">To suspend a sender, find them under People and turn off their account.</p>
    </>
  );
}
