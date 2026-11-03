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
