import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { track } from "@/lib/track";

// Browser-side events. Only a short allow-list, so this can't be used to fill the log with junk.
const ALLOWED = new Set(["link_opened", "shared", "share_card_made", "install_prompt"]);

export async function POST(request: Request) {
  let body: { event?: string; path?: string; ref?: string; props?: Record<string, string | number | boolean> } = {};
  try { body = JSON.parse(await request.text()); } catch { return new NextResponse(null, { status: 400 }); }
  if (!body.event || !ALLOWED.has(body.event)) return new NextResponse(null, { status: 400 });
  const me = await getMe();
  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(body.props ?? {}).slice(0, 8)) if (/^[a-z_]{1,30}$/.test(k) && ["string", "number", "boolean"].includes(typeof v)) props[k] = typeof v === "string" ? v.slice(0, 80) : v;
  if (body.ref && /^[a-z0-9]{8}$/.test(body.ref)) props.ref = body.ref;
  await track(body.event, { userId: me?.id ?? null, path: typeof body.path === "string" && body.path.startsWith("/") ? body.path : undefined, props });
  return new NextResponse(null, { status: 204 });
}
