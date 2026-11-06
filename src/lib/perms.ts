// Shared by server and browser code.
export const PERMS = [
  ["sessions.post", "Post their own sessions"],
  ["sessions.manage_all", "Post and edit any coach's sessions"],
  ["roster.manage", "Add and remove athletes from sessions"],
  ["results.log", "Log results and coach notes"],
  ["medical.view", "See allergies and medical notes"],
  ["film.manage", "Add and manage film"],
  ["staff.manage", "Invite and manage coaches"],
  ["billing.manage", "Packages and payments"],
  ["brand.manage", "Program name, logo and colors"],
] as const;
export type Perm = (typeof PERMS)[number][0];
export const FEATURES = [
  ["booking", "Family booking"],
  ["film_uploads", "Video uploads"],
  ["voice", "Voice logging"],
  ["recruiting", "Recruiting profile links"],
  ["payments", "Online payments"],
  ["messaging", "Team messaging"],
] as const;
export type Features = Record<(typeof FEATURES)[number][0], boolean>;

export const ROLE_DEFAULTS: Record<"owner" | "coach", Perm[]> = {
  owner: PERMS.map(([k]) => k),
  coach: ["sessions.post", "roster.manage", "results.log", "medical.view", "film.manage"],
};

/** Reads permission checkboxes back from a form: null = role defaults. */
export function readPerms(form: FormData): string[] | null {
  if (form.get("defaults") === "on") return null;
  return form.getAll("perm").map(String);
}
