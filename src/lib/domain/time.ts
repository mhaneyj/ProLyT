// Event times are entered in the host's local time (Pacific for now) and stored in UTC.
export const TZ = "America/Los_Angeles";

/** "2027-03-06T08:00" in `tz` → Date. */
export function zonedToUtc(local: string, tz = TZ): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error("Pick a date and time");
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = (d: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(d)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - d;
  };
  let t = asUtc - offset(asUtc);
  t = asUtc - offset(t); // settle across a DST change
  return new Date(t);
}

/** Date → "2027-03-06T08:00" in `tz` (for datetime-local inputs). */
export function utcToZoned(d: Date | string, tz = TZ): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const clock = (d: Date | string) => new Date(d).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
