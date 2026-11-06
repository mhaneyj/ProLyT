import type { MetadataRoute } from "next";
import { brandBySlug, currentOrgSlug } from "@/lib/org";

// "Add to Home Screen": on a program's own address the app installs under that program's name.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await brandBySlug(await currentOrgSlug()).catch(() => null);
  const name = brand?.name ?? "ProLyt";
  return {
    name,
    short_name: name.length > 12 ? name.split(/\s+/)[0].slice(0, 12) : name,
    description: "Training, film, messages and your athlete record.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#070707",
    theme_color: "#070707",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
