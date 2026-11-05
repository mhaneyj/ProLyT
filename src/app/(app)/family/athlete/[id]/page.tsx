import { redirect } from "next/navigation";

export default async function OldProgress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/athlete/${id}/progress`);
}
