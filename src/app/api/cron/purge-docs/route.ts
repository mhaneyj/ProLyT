import { NextResponse, type NextRequest } from "next/server";
import { asService } from "@/lib/db";

// Daily (Vercel Cron): delete age documents nobody reviewed within 30 days.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [{ n }] = await asService((q) => q<{ n: number }>("select purge_stale_age_documents() n"));
  return NextResponse.json({ purged: n });
}
