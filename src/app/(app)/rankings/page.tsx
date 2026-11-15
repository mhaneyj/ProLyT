import { redirect } from "next/navigation";

// Power Rankings live in the Arena tab now. Old links keep working.
export default async function Rankings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "rankings" });
  for (const k of ["sport", "band", "group", "error"]) if (sp[k]) q.set(k, sp[k]!);
  redirect(`/feed?${q}`);
}
