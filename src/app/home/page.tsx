import { redirect } from "next/navigation";
import { requireMe, homeFor } from "@/lib/auth";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const to = homeFor(await requireMe());
  redirect(error ? `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.slice(0, 300))}` : to);
}
