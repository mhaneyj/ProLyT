export const PROGRAMS: Record<string, { kind: "group" | "one_on_one" | "camp"; label: string }> = {
  "7v7": { kind: "group", label: "7v7" },
  trenches: { kind: "group", label: "In The Trenches" },
  "1on1": { kind: "one_on_one", label: "1-on-1" },
  camp: { kind: "camp", label: "Camp" },
};
export const programOptions = Object.entries(PROGRAMS).map(([v, p]) => ({ v, label: p.label }));
