import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Empty, Pill } from "@/components/ui";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Trainers · ProLyt admin" };

type T = { user_id: string; slug: string; display_name: string; city: string | null; listed: boolean; verified_at: string | null; payouts_enabled: boolean;
  email: string | null; services: number; open: number; booked: number };

async function verify(form: FormData) {
  "use server";
  const me = await requirePlatformAdmin();
  const id = String(form.get("id"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await asUser(me.id, (q) => q("select admin_verify_trainer($1, $2)", [id, form.get("on") === "1"]));
  revalidatePath("/admin/trainers");
}

export default async function AdminTrainers() {
  const me = await requirePlatformAdmin();
  const rows = await asUser(me.id, (q) => q<T>(`
    select t.user_id, t.slug, t.display_name, t.city, t.listed, t.verified_at, t.payouts_enabled, p.email,
      (select count(*)::int from trainer_services s where s.trainer_id = t.user_id and s.active) services,
      (select count(*)::int from trainer_slots ts where ts.trainer_id = t.user_id and ts.cancelled_at is null and ts.starts_at > now()) open,
      (select count(*)::int from trainer_bookings b join trainer_slots ts on ts.id = b.slot_id where ts.trainer_id = t.user_id and b.status in ('confirmed','completed')) booked
    from trainer_profiles t left join profiles p on p.id = t.user_id order by t.created_at desc`));
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Trainers</h1>
      <AdminTabs on="trainers" />
      <p className="text-[12px] text-muted">Mark a trainer background checked only after their check comes back clear. Families see the badge on every trainer page.</p>
      {!rows.length ? <Empty title="No trainers yet">Anyone can start at /trainer.</Empty> : rows.map((t) => (
        <Card key={t.user_id} className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span><Link href={`/trainers/${t.slug}`} className="block font-semibold text-gold">{t.display_name}</Link>
              <span className="block text-[12px] text-muted">{[t.email, t.city].filter(Boolean).join(" · ")}</span></span>
            <span className="flex flex-col items-end gap-1">{t.listed ? <Pill tone="good">Live</Pill> : <Pill>Hidden</Pill>}{t.payouts_enabled ? <Pill tone="good">Card pay</Pill> : null}</span>
          </div>
          <div className="text-[13px] text-soft">{t.services} services · {t.open} open times · {t.booked} bookings</div>
          <form action={verify}><input type="hidden" name="id" value={t.user_id} /><input type="hidden" name="on" value={t.verified_at ? "0" : "1"} />
            <button className={`min-h-11 w-full rounded-md text-sm font-bold ${t.verified_at ? "border border-line" : "bg-good text-ink"}`}>{t.verified_at ? "✓ Background checked · remove" : "Mark background checked"}</button></form>
        </Card>
      ))}
    </>
  );
}
