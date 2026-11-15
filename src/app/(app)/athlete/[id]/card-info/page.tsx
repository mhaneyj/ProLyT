import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadPlayerCard, cardAttrs } from "@/lib/cards";
import { GROUPS } from "@/lib/power";
import { Notice, Title } from "@/components/ui";
import { loadAthlete } from "../header";
import { CardInfoForm } from "./form";

export const metadata = { title: "Card info" };

export default async function CardInfo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/card-info");
  if (!a.family) notFound();
  const v = await loadPlayerCard(me.id, id);
  if (!v) notFound();
  const [own] = await asUser(me.id, (q) => q<{ card_team: string | null; card_number: string | null }>("select card_team, card_number from athletes where id = $1", [id]));
  const photo = v.aiPhoto ?? (a.has_photo ? `/api/photo/${a.id}` : null);
  return (
    <>
      {switcher}
      <Link href={`/athlete/${a.id}/cards`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Player Card</Link>
      <Title sub="What you type here is what prints on the card. Ratings and stats still come only from tests and coaches.">Make your card</Title>
      {sp.saved ? <Notice tone="good">Saved. Your card is updated.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <CardInfoForm athlete={a.id} first={a.first_name} last={a.last_name} photo={photo} ovr={v.rating.ovr} attrs={cardAttrs(v)} trench={v.rating.trench} foil={v.plus} sponsor={v.sponsor}
        position={a.position ?? ""} grad={a.grad_year ? String(a.grad_year) : ""} number={own?.card_number ?? ""} team={own?.card_team ?? ""} fallbackTeam={v.team} fallbackNumber={v.jersey} hometown={a.hometown ?? ""} positions={GROUPS[a.sport.toLowerCase()] ?? GROUPS.football} />
      <p className="text-sm text-soft">Photo: <Link href={`/athlete/${a.id}`} className="font-semibold text-gold">change it on the profile</Link>{a.has_photo ? <> or <Link href={`/athlete/${a.id}/ai-photo`} className="font-semibold text-gold">make an action shot</Link></> : null}.</p>
    </>
  );
}
