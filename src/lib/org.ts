import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { asService } from "./db";

export type Brand = { id: string; name: string; slug: string; logo_url: string | null; brand_color: string };

/**
 * Which program's branding to show, from the web address:
 * gamefit-loomis.prolyt.app → "gamefit-loomis". Falls back to NEXT_PUBLIC_ORG_SLUG
 * (single-program deployments and local dev). Null on the bare ProLyt domain.
 */
export const currentOrgSlug = cache(async (): Promise<string | null> => {
  const h = await headers();
  // The original address: Vercel and Next's own server-action redirects keep it in
  // x-forwarded-host. This only picks which program's look to show; data access is
  // decided by the user's memberships and row-level security, never by this header.
  const raw = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const host = raw.split(":")[0].toLowerCase();
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
  if (root && host.endsWith("." + root)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub && sub !== "www" && sub !== "app") return sub;
  }
  return process.env.NEXT_PUBLIC_ORG_SLUG ?? (root && host === root ? null : "gamefit-loomis");
});

// Program branding is public information (shown on sign-in pages), so it's read with the server role.
export const brandBySlug = cache(async (slug: string | null): Promise<Brand | null> => {
  if (!slug) return null;
  const [b] = await asService((q) => q<Brand>("select id, name, slug, logo_url, brand_color from orgs where slug = $1", [slug]));
  return b ?? null;
});

export const brandById = cache(async (id: string | null): Promise<Brand | null> => {
  if (!id) return null;
  const [b] = await asService((q) => q<Brand>("select id, name, slug, logo_url, brand_color from orgs where id = $1", [id]));
  return b ?? null;
});
