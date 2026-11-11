import { Directory } from "@/app/trainers/directory";

export const metadata = { title: "Coaches · ProLyt", description: "Football coaches: who they are, what they teach, and open 1-on-1 times." };

export default async function Coaches({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const { s, q } = await searchParams;
  return Directory({ s, q, coaches: true });
}
