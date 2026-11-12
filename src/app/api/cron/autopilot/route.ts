import { NextResponse, type NextRequest } from "next/server";
import { runAutopilot } from "@/lib/autopilot";

// Daily at 4 PM Pacific (Vercel Cron): session reminders, come-back nudges, plan sessions left, new challenges.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ sent: await runAutopilot() });
}
