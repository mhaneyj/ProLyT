import { NextResponse, type NextRequest } from "next/server";
import { runReports } from "@/lib/autopilot";

// 1st of each month, 9 AM Pacific: last month's progress report to every family with something to show.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runReports());
}
