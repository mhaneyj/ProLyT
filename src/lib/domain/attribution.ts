/** Which kind of link brought them in, from the page they first landed on. */
export function channelFor(landing: string | null, hasRef: boolean) {
  if (landing?.startsWith("/join-team/")) return "team_link";
  if (landing?.startsWith("/e/") || landing?.startsWith("/register-team/")) return "event_link";
  if (landing?.startsWith("/p/")) return "recruiting_link";
  if (landing?.startsWith("/join/") || landing?.startsWith("/link/")) return "invite";
  return hasRef ? "share" : "direct";
}
