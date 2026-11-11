// Division rules for 7v7 (and other) events: presets hosts can start from, and plain-English rule text.

export type Division = {
  id?: string; name: string; basis: "age" | "grade" | "either";
  max_age: number | null; min_age?: number | null; age_cutoff: string | null;
  max_grade: number | null; min_grade?: number | null;
  no_seniors: boolean; gender: "open" | "girls" | "boys"; roster_max: number; team_cap?: number | null; sort?: number;
};

const ord = (n: number) => (n === 0 ? "K" : `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`);
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "14 or younger on Jan 1, 2027 · No seniors · Up to 30 players" */
export function ruleText(d: Division): string {
  const age = d.max_age != null && d.age_cutoff ? `${d.max_age} or younger on ${dateLabel(d.age_cutoff)}` : null;
  const grade = d.max_grade != null ? (d.max_grade >= 12 ? "High school" : `${ord(d.max_grade)} grade or lower`) : null;
  const main = d.basis === "age" ? age : d.basis === "grade" ? grade : [age, grade].filter(Boolean).join(", or ");
  return [main, d.no_seniors ? "No seniors" : null, d.gender === "girls" ? "Girls" : d.gender === "boys" ? "Boys" : null, `Up to ${d.roster_max} players`]
    .filter(Boolean).join(" · ");
}

/** The cutoff date most circuits use for an event: Jan 1 of the event's year. */
export function defaultCutoff(startsOn: string) {
  return `${startsOn.slice(0, 4)}-01-01`;
}

export const PRESETS: Record<string, { label: string; help: string; build: (startsOn: string) => Division[] }> = {
  age7v7: {
    label: "7v7 by age (Jan 1 cutoff)",
    help: "8U, 10U, 12U, 14U, 15U and High School (no seniors). Used by most national 7v7 circuits.",
    build: (s) => {
      const c = defaultCutoff(s);
      const a = (name: string, max: number, sort: number): Division => ({ name, basis: "age", max_age: max, age_cutoff: c, max_grade: null, no_seniors: false, gender: "open", roster_max: 30, sort });
      return [a("8U", 8, 1), a("10U", 10, 2), a("12U", 12, 3), a("14U", 14, 4), a("15U", 15, 5),
        { name: "High School", basis: "grade", max_age: null, age_cutoff: null, max_grade: 12, no_seniors: true, gender: "open", roster_max: 30, sort: 6 }];
    },
  },
  ageOrGrade: {
    label: "Age or grade (either qualifies)",
    help: "12U = 12 or younger or 6th grade or lower; 14U = 14 or younger or 8th grade or lower. Keeps classmates together.",
    build: (s) => {
      const c = defaultCutoff(s);
      const e = (name: string, max: number, g: number, sort: number): Division => ({ name, basis: "either", max_age: max, age_cutoff: c, max_grade: g, no_seniors: false, gender: "open", roster_max: 30, sort });
      return [e("10U", 10, 4, 1), e("12U", 12, 6, 2), e("14U", 14, 8, 3),
        { name: "High School", basis: "grade", max_age: null, age_cutoff: null, max_grade: 12, no_seniors: true, gender: "open", roster_max: 30, sort: 4 }];
    },
  },
  grade: {
    label: "By school grade",
    help: "3rd–4th, 5th–6th, 7th–8th, High School (no seniors). Families pick by grade; report cards confirm it.",
    build: () => {
      const g = (name: string, min: number, max: number, sort: number): Division => ({ name, basis: "grade", max_age: null, age_cutoff: null, min_grade: min, max_grade: max, no_seniors: false, gender: "open", roster_max: 30, sort });
      return [g("3rd–4th Grade", 3, 4, 1), g("5th–6th Grade", 5, 6, 2), g("7th–8th Grade", 7, 8, 3),
        { name: "High School", basis: "grade", max_age: null, age_cutoff: null, min_grade: 9, max_grade: 12, no_seniors: true, gender: "open", roster_max: 30, sort: 4 }];
    },
  },
  girls: {
    label: "Girls 7v7 by age",
    help: "Girls 10U, 12U, 14U, 15U and High School.",
    build: (s) => {
      const c = defaultCutoff(s);
      const a = (name: string, max: number, sort: number): Division => ({ name, basis: "age", max_age: max, age_cutoff: c, max_grade: null, no_seniors: false, gender: "girls", roster_max: 30, sort });
      return [a("Girls 10U", 10, 1), a("Girls 12U", 12, 2), a("Girls 14U", 14, 3), a("Girls 15U", 15, 4),
        { name: "Girls High School", basis: "grade", max_age: null, age_cutoff: null, max_grade: 12, no_seniors: true, gender: "girls", roster_max: 30, sort: 5 }];
    },
  },
  none: { label: "I'll add divisions myself", help: "Start empty.", build: () => [] },
};

export const WAIVER_TEMPLATE = `I am the parent or legal guardian of the athlete named in this registration. I understand that football and related activities involve risk of injury. I give permission for my athlete to participate in this event and agree to release the event host, its staff, volunteers and facility from claims arising from ordinary participation, except those caused by gross negligence or willful misconduct. I confirm my athlete is physically able to participate, and I authorize event staff to seek emergency medical care for my athlete if I cannot be reached.

(Template only. Have your attorney review your waiver before using it.)`;
