import { redirect } from "next/navigation";
import { requireMe, homeFor } from "@/lib/auth";

export default async function Home() {
  redirect(homeFor(await requireMe()));
}
