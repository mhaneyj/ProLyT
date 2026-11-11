import { CoachPublic, coachMetadata } from "@/app/trainers/[slug]/view";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { return coachMetadata((await params).slug); }

export default async function CoachPage({ params }: { params: Promise<{ slug: string }> }) {
  return CoachPublic({ slug: (await params).slug });
}
