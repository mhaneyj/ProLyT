export const TZ = "America/Los_Angeles";

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });

export const dayTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });

export const time = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export const shortDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });

export function ageOn(birth: string | Date, on = new Date()) {
  const b = new Date(birth);
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
  return age;
}

/** Same-day check in Loomis time. */
export function isSameLocalDay(a: Date | string, b: Date | string = new Date()) {
  const f = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
  return f(a) === f(b);
}

/** "now", "5m", "3h", then a weekday or date: inbox-style. */
export function ago(d: Date | string, now = new Date()) {
  const s = Math.max(0, (now.getTime() - new Date(d).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (isSameLocalDay(d, now)) return `${Math.floor(s / 3600)}h`;
  if (s < 6 * 86400) return new Date(d).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  return shortDate(d);
}
