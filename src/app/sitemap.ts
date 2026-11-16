import type { MetadataRoute } from "next";
import { ROOT_DOMAIN } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${ROOT_DOMAIN}`;
  return ["", "/legal/privacy", "/legal/participation"].map((p) => ({ url: `${base}${p}` }));
}
