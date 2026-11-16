import type { MetadataRoute } from "next";
import { ROOT_DOMAIN } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/", "/legal/"], disallow: ["/api/", "/family", "/coach", "/owner", "/admin", "/athlete"] }, sitemap: `https://${ROOT_DOMAIN}/sitemap.xml` };
}
