export const SPECIALTIES = ["QB", "WR", "RB", "DB", "LB", "OL", "DL", "Speed", "Strength", "Agility", "Film study", "Flag"] as const;
export const KIND_LABEL: Record<string, string> = { one_on_one: "1-on-1", small_group: "Small group", virtual: "Virtual" };

/** "Coach Tee Smith" → "coach-tee-smith" (lowercase letters, numbers, dashes; 3–40 long). */
export function slugify(s: string) {
  const v = s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
  return v.length >= 3 ? v : `${v || "trainer"}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Weekly repeats of a start time: the same local clock time each week. */
export function weekly(first: Date, weeks: number) {
  const out: Date[] = [];
  for (let i = 0; i < Math.max(1, Math.min(12, weeks)); i++) out.push(new Date(first.getTime() + i * 7 * 86400000));
  return out;
}
