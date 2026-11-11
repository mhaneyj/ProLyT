import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  outputFileTracingIncludes: { "/**": ["./db/**/*.sql"] },
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
    ];
    return [
      // Age documents embed inside the reviewer's own page only.
      { source: "/api/verify/doc/:id", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, ...common] },
      { source: "/((?!api/verify/doc/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, ...common] },
    ];
  },
};

export default nextConfig;
