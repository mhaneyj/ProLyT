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
