import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  outputFileTracingIncludes: { "/**": ["./db/**/*.sql"] },
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
    ];
    return [
      // Age documents embed inside the reviewer's own page only.
      { source: "/api/verify/doc/:id", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, ...common] },
      // The notification worker updates as soon as a new version ships.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      { source: "/((?!api/verify/doc/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, ...common] },
    ];
  },
};

export default nextConfig;
