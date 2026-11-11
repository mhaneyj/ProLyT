import { redirect } from "next/navigation";
import { MARKETPLACE } from "@/lib/trainers";
import { Directory } from "./directory";

export const metadata = { title: "Trainers · ProLyt", description: "Football coaches and trainers: QB, WR, line play, speed and strength." };

// Public directory of trainers who are live. Anyone can browse; booking needs a parent account.
export default async function Trainers({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const { s, q } = await searchParams;
  if (!MARKETPLACE) redirect(`/coaches${s || q ? `?${new URLSearchParams(Object.entries({ s: s ?? "", q: q ?? "" }).filter(([, v]) => v)).toString()}` : ""}`);
  return Directory({ s, q, coaches: false });
}

