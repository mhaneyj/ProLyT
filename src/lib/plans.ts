// What programs pay ProLyt. Prices are settings so they can change without a release.
export const CLUB_MONTHLY_CENTS = Number(process.env.CLUB_MONTHLY_CENTS ?? 4900);
export const CLUB_YEARLY_CENTS = Number(process.env.CLUB_YEARLY_CENTS ?? 49000);

export const PLAN_LINES: { label: string; starter: boolean; club: boolean }[] = [
  { label: "Schedule, booking and attendance", starter: true, club: true },
  { label: "Online payments and coach pay", starter: true, club: true },
  { label: "Team messaging and announcements", starter: true, club: true },
  { label: "Athlete profiles, verified stats and rankings", starter: true, club: true },
  { label: "Host events: divisions, waivers, check-in, live scores", starter: true, club: true },
  { label: "Video uploads and highlights", starter: false, club: true },
  { label: "Voice logging for coaches", starter: false, club: true },
  { label: "Age verification for events", starter: false, club: true },
  { label: "Public coach pages", starter: false, club: true },
];

// ProLyt+ for families. The core app is always free; Plus is for families who want more on recruiting and film.
export const PLUS_MONTHLY_CENTS = Number(process.env.PLUS_MONTHLY_CENTS ?? 599);
export const PLUS_YEARLY_CENTS = Number(process.env.PLUS_YEARLY_CENTS ?? 4900);
export const PLUS_TRIAL_DAYS = Math.max(0, Number(process.env.PLUS_TRIAL_DAYS ?? 14));

export const PLUS_LINES: { label: string; detail: string; free: boolean }[] = [
  { label: "Athlete profile, career, stats and film links", detail: "Everything your program records, in one place.", free: true },
  { label: "Booking, payments, messages, events and live scores", detail: "Run the season from your phone.", free: true },
  { label: "Recruiting link with a view count", detail: "Share one link with coaches.", free: true },
  { label: "Alerts when a coach opens the profile", detail: "Know the moment your link gets opened (at most once an hour).", free: false },
  { label: "Recruiting insights", detail: "Opens by day for the last 30 days and when it was last opened.", free: false },
  { label: "Upload video for your athletes", detail: "Game film and highlights straight from your phone, even if your program's plan doesn't include uploads.", free: false },
  { label: "Covers every athlete in your family", detail: "One subscription, no charge per kid.", free: false },
];
