import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadAthlete } from "../header";
import { ProfileForm } from "./form";

export const metadata = { title: "Edit profile" };

export default async function EditProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/edit");
  if (!a.family) notFound();
  const body = await asUser(me.id, (q) => q<{ metric: string; value: number }>(`
    select distinct on (metric) metric, value::float value from results where athlete_id = $1 and voided_at is null
    order by metric, recorded_at desc`, [id]));
  const val = (k: string) => { const r = body.find((x) => x.metric === k); return r ? String(r.value) : ""; };
  return (
    <>
      {switcher}
      <Link href={`/athlete/${id}`} className="text-sm font-semibold">← Profile</Link>
      <h1 className="font-display text-[34px] uppercase leading-none">Edit {a.self ? "your" : `${a.first_name}'s`} profile</h1>
      <ProfileForm v={{
        athlete: id, position: a.position ?? "", grad_year: a.grad_year ? String(a.grad_year) : "", sport: a.sport, hometown: a.hometown ?? "",
        school: a.school ?? "", bio: a.bio ?? "", highlight_url: a.highlight_url ?? "", gpa: a.gpa ? String(a.gpa) : "",
        intended_major: a.intended_major ?? "", show_academics: a.show_academics, theme_color: a.theme_color ?? "#F8C40A", gender: a.gender ?? "",
        height: val("height_in"), weight: val("weight_lb"), wingspan: val("wingspan_in"),
        featured: a.featured_metrics ?? [], has: body.map((b) => b.metric),
      }} />
    </>
  );
}
