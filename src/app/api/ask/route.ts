import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";
import { roleOf } from "@/lib/guide";
import { ask, ASK_MAX, type Turn } from "@/lib/ask";

export const maxDuration = 30;

// Ask ProLyt: answers from the guide only. Signed-in people, 5 a minute and 30 a day. The question is never stored.
export async function POST(request: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in to ask." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { question?: unknown; history?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, ASK_MAX) : "";
  if (question.length < 3) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  const history: Turn[] = Array.isArray(body.history)
    ? body.history.filter((t): t is Turn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string").map((t) => ({ role: t.role, content: t.content.slice(0, 1200) })).slice(-4)
    : [];
  const [{ ok }] = await asService((q) => q<{ ok: boolean }>("select ask_take($1) ok", [me.id]));
  if (!ok) return NextResponse.json({ error: "That's a lot of questions. Try again in a minute, or use Help & feedback." }, { status: 429 });
  return NextResponse.json(await ask(question, roleOf(me.roles), history));
}
