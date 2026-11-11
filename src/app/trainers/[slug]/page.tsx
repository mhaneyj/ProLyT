import { redirect } from "next/navigation";
import { MARKETPLACE } from "@/lib/trainers";
import { CoachPublic, coachMetadata } from "./view";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { return coachMetadata((await params).slug); }

export default async function TrainerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ svc?: string }> }) {
  const [{ slug }, { svc }] = await Promise.all([params, searchParams]);
  if (!MARKETPLACE) redirect(`/coaches/${slug}`);
  return CoachPublic({ slug, svc });
}
