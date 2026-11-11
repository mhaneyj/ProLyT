import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";
import { track } from "@/lib/track";

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
const bad = () => NextResponse.json({ error: "Bad subscription" }, { status: 400 });

// This device said yes to notifications.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = b.endpoint ?? "", p256dh = b.keys?.p256dh ?? "", auth = b.keys?.auth ?? "";
  if (!/^https:\/\/[\w.-]+\//.test(endpoint) || endpoint.length > 1000 || !/^[\w-]{40,200}$/.test(p256dh) || !/^[\w-]{10,100}$/.test(auth)) return bad();
  // A shared device moves to whoever signed in last.
  await asService((q) => q(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0`,
    [me.id, endpoint, p256dh, auth, (req.headers.get("user-agent") ?? "").slice(0, 300)]));
  await track("push_enabled", { userId: me.id });
  return NextResponse.json({ ok: true });
}

// This device turned them off.
export async function DELETE(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (b.endpoint) await asService((q) => q("delete from push_subscriptions where endpoint = $1 and user_id = $2", [b.endpoint, me.id]));
  return NextResponse.json({ ok: true });
}
