const PLATFORM_SUBDOMAINS = new Set(["www", "app", "api", "admin"]);

/** prolyt.com / www.prolyt.com → ProLyt itself; gamefit-loomis.prolyt.com → that program. */
export function slugForHost(host: string, root: string, forced: string | null): string | null {
  if (root) {
    if (host === root) return forced;
    if (host.endsWith("." + root)) {
      const sub = host.slice(0, -(root.length + 1));
      return !sub || sub.includes(".") || PLATFORM_SUBDOMAINS.has(sub) ? forced : sub;
    }
  }
  // Other addresses (a *.vercel.app preview, localhost without a root domain)
  return forced ?? "gamefit-loomis";
}

/** ProLyt's own addresses and local/preview hosts never need a custom-domain lookup. */
export function isPlatformHost(host: string, root: string) {
  return (!!root && (host === root || host.endsWith("." + root))) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".vercel.app");
}
