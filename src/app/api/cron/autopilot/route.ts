import { NextResponse, type NextRequest } from "next/server";
import { runAutopilot } from "@/lib/autopilot";
import { refreshPower } from "@/lib/power";

// Daily (Vercel Cron): session reminders, come-back nudges, plan sessions left, new challenges, then the power rankings snapshot.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sent = await runAutopilot();
  const power = await refreshPower().catch((e) => { console.error("[power] refresh failed:", e); return null; });
  return NextResponse.json({ sent, power });
}
