// The in-app guide. One source for the Guide page and the Ask ProLyt bot, so they never disagree.
// Keep each topic short and true to what the app does today. Add a topic when a feature ships.

export type Role = "family" | "coach" | "owner";
export type Topic = { id: string; title: string; roles: Role[]; summary: string; steps: string[]; href?: string; linkLabel?: string };

export const GUIDE: Topic[] = [
  // ---------- Families ----------
  { id: "book", title: "Book a session", roles: ["family"], href: "/schedule", linkLabel: "Open Schedule",
    summary: "Book group sessions for your athlete from the Schedule tab.",
    steps: ["Open Schedule and find the session.", "Tap Book next to your athlete's name. Tap again to cancel.", "Your plan may include a set number of sessions a week. Extra ones can be booked or paid for if your program allows it."] },
  { id: "waitlist", title: "Full session? Join the waitlist", roles: ["family"], href: "/schedule", linkLabel: "Open Schedule",
    summary: "A full free session shows Join waitlist. When a spot opens, the next family in line gets it held for 2 hours.",
    steps: ["Tap Join waitlist on the full session. You see your place in line.", "When a spot opens you get a notification and the spot is held for you, up to 2 hours (never later than 30 minutes before the session).", "Open Schedule and tap Book before the hold ends. If you don't, it moves to the next family.", "Tap Leave to get out of the line."] },
  { id: "packs", title: "Session packs and credits", roles: ["family"], href: "/schedule", linkLabel: "See packs",
    summary: "A pack is a bundle of sessions you buy once and spend on paid sessions and extra sessions. Credits are shared across your athletes in that program.",
    steps: ["Open Schedule. If your program sells packs you see Save with a pack. Tap the price to pay securely with Stripe.", "On a paid session your athlete is eligible for, tap Use 1 credit instead of paying again.", "A pack can cover sessions only up to a price the program sets, and it expires after a set number of days. You get a reminder a week before.", "If a coach takes your athlete off a session you booked with a credit, the credit comes back."] },
  { id: "card", title: "The Player Card", roles: ["family"], href: "/family", linkLabel: "Go to Home",
    summary: "Your athlete's card shows an overall rating (OVR) built only from verified tests and coach ratings. It can't be bought.",
    steps: ["Open your athlete from Home, then Player Card.", "Tap the card to flip it for the back: tests, ranks and challenges.", "OVR needs at least 3 verified attributes. More tests and coach ratings fill it in.", "ProLyt+ unlocks the full attribute view."] },
  { id: "card-info", title: "Edit what prints on the card", roles: ["family"], summary: "A parent or the athlete sets position, jersey number, team name, class year and hometown. Ratings and stats are never editable.",
    steps: ["Open the Player Card and tap Edit card info.", "Type your changes. The card preview updates as you type.", "Tap Save card info. Leave team or number blank and the card uses the program's.", "To change the photo, go to the athlete's profile."] },
  { id: "packs-rip", title: "Card packs and the binder", roles: ["family"], summary: "Every card your athlete earns arrives as a pack to open. Opened cards fill a 12-slot binder.",
    steps: ["When a coach logs results or your athlete hits a milestone, a pack can appear. Look for the packs banner on Home or the Player Card.", "Tap it to open the pack. Tap to reveal the card.", "The binder shows what's collected and a hint for each locked slot.", "Packs are earned, never sold."] },
  { id: "goals", title: "Coach-set goals", roles: ["family"], summary: "A coach can set up to 3 goals for your athlete, like a 40-yard dash target. Only your family and the coaches who test your athlete can see them.",
    steps: ["Open your athlete, then Progress, then Goals.", "You see the target, where your athlete is now and a progress bar.", "Goals never appear on cards, share links or boards."] },
  { id: "rankings", title: "Power Rankings (Arena)", roles: ["family", "coach"], href: "/feed?tab=rankings", linkLabel: "Open Rankings",
    summary: "The Arena tab's Rankings show a Top 10 by sport, age level and position, from verified tests and coach ratings.",
    steps: ["Open Arena, then Rankings. Pick sport, age level and position.", "A board shows once at least 3 athletes in that group have a rating.", "Names show only for athletes 13 and older whose parent turned it on. Everyone else shows as Player. Athletes under 13 always show as Player.", "A parent can switch their athlete's name on or off under Your athletes.", "Tap Save the Top 10 card to download the board as an image."] },
  { id: "arena", title: "Arena: Following and Everyone", roles: ["family", "coach"], href: "/feed?tab=following", linkLabel: "Open Arena",
    summary: "Arena also has a feed of posts from athletes you follow (Following) and from the program (Everyone).", steps: ["Open Arena and switch tabs at the top.", "Follow athletes from Find athletes.", "Post updates and give Props on others' posts."] },
  { id: "ai-photo", title: "AI action shot", roles: ["family"], summary: "A parent can turn a regular photo into a stylized action shot for the card. It always needs a parent's consent and approval.",
    steps: ["Open Player Card, then AI action shot.", "A parent gives consent once. You can turn it off any time.", "Make a shot, then choose Use on card, Discard or Use real photo.", "There is a monthly limit on shots."] },
  { id: "report", title: "Monthly report", roles: ["family"], summary: "Each month families get a short progress report by email, also available inside the app.", steps: ["Open your athlete, then Progress, then Last month's report."] },
  { id: "plans", title: "Plans and ProLyt+", roles: ["family"], href: "/plus", linkLabel: "See ProLyt+",
    summary: "Your program may offer monthly plans (sessions per week). ProLyt+ is the optional upgrade that unlocks the full card view.", steps: ["Your program sets up its plans. If you are not sure what yours includes, ask your coach.", "ProLyt+ is offered from the Player Card and the ProLyt+ page."] },
  { id: "messages", title: "Message your coaches", roles: ["family", "coach"], href: "/messages", linkLabel: "Open Messages", summary: "Questions about sessions, schedule or your athlete go to the coaches through Messages.", steps: ["Open Messages.", "Start a message or open an existing thread."] },
  { id: "privacy", title: "Privacy for young athletes", roles: ["family", "coach", "owner"], summary: "Athletes under 13 have no login of their own and are never named on public boards. Parents control sharing.",
    steps: ["Only the family and the coaches who work with an athlete see their card and goals.", "Boards name only athletes 13 and older whose parent opted in.", "School is visible only to the athlete's program coaches."] },

  // ---------- Coaches ----------
  { id: "coach-start", title: "Get set up and get paid", roles: ["coach"], href: "/coach/start", linkLabel: "Open Get set up",
    summary: "New coaches finish a short setup. Contractor coaches add their bank on Stripe's secure page to get paid weekly.",
    steps: ["Open your invite link and sign in.", "On Get set up, tap Set up payouts and finish Stripe's form (about 5 minutes). ProLyt never sees your bank details.", "Pay for coaching sessions pays out weekly on Fridays.", "Employee coaches are paid through the program's payroll, with nothing to set up."] },
  { id: "checkin", title: "Run a session: check in and log results", roles: ["coach"], href: "/coach", linkLabel: "Open Today",
    summary: "Today shows your current session. Check kids in, then log results or notes.",
    steps: ["Open Today and tap Check in.", "Tap each kid, or All here.", "Log a result with the number pad, or in batch for the whole group.", "You can add a coach note that goes to the family.", "Mark a kid absent so the family gets a rebook nudge the next day."] },
  { id: "testing", title: "Testing Day", roles: ["coach"], href: "/coach/testing", linkLabel: "Open Testing Day",
    summary: "Pick the stations and the group, enter numbers for everyone, and cards, ranks and challenges update.", steps: ["Open Testing Day from Today.", "Pick the test and the group.", "Enter numbers. Obvious typos are flagged before anything saves.", "Save. Families can see results right away."] },
  { id: "roster-board", title: "Roster board", roles: ["coach"], href: "/coach/roster", linkLabel: "Open Roster board",
    summary: "Every athlete with OVR, position rank, days since last test, attendance and unopened packs. Sort by who needs a test.", steps: ["Open Roster board from Today.", "Sort by Needs test, Top OVR or A to Z.", "Tap Goals on a row to set a goal.", "Tap Start Testing Day to test the kids who are due."] },
  { id: "coach-goals", title: "Set a goal for an athlete", roles: ["coach"], summary: "Pick a test, a target number, an optional date and a short note. Up to 3 goals per athlete. Families see them; the public doesn't.", steps: ["From the Roster board tap Goals on the athlete.", "Choose the test and enter the target.", "Save. Setting a new target for the same test replaces the old one."] },
  { id: "coach-waitlist", title: "Removing a kid from a session", roles: ["coach"], summary: "If you remove an athlete from a full session, the next family on the waitlist is offered the spot. A pack credit used for that session returns to the family.", steps: ["Open the session and remove the athlete.", "ProLyt offers the freed spot to the next family automatically."] },

  // ---------- Owners ----------
  { id: "owner-packs", title: "Create session packs", roles: ["owner"], href: "/owner/packs", linkLabel: "Open Session packs",
    summary: "Create prepaid bundles, like 10 sessions, with a price, an expiry and an optional per-session price cap.", steps: ["Open Settings, then Session packs.", "Enter a name, number of sessions, price and days it's good for.", "Optionally set Covers sessions up to to protect higher-priced sessions.", "Turn a pack off any time. Families who already bought keep their credits."] },
  { id: "owner-payouts", title: "Payments and coach payouts", roles: ["owner"], summary: "Families pay through Stripe. Contractor coaches are paid weekly from their earnings. Employee coaches go through your payroll.", steps: ["Connect Stripe from your billing settings.", "Invite coaches and mark them contractor or employee.", "Contractor coaches finish payout setup on their Get set up page."] },
  { id: "owner-sponsor", title: "Sponsors on cards and reports", roles: ["owner"], href: "/owner/sponsor", linkLabel: "Open Sponsor",
    summary: "Add a sponsor name that prints as Presented by on cards and monthly reports. The sponsor pays the program, never the athlete.", steps: ["Open Owner tools, then Sponsor.", "Enter the name. A printable one-pager for sponsors is linked there."] },
];

export const forRole = (role: Role) => GUIDE.filter((t) => t.roles.includes(role) || (role === "owner" && t.roles.includes("coach")));
export const roleOf = (roles: string[]): Role => (roles.includes("owner") ? "owner" : roles.includes("coach") ? "coach" : "family");

/** The guide as plain text, for the bot's context. */
export function guideText(role: Role) {
  return forRole(role).map((t) => `## ${t.title}${t.href ? ` (${t.href})` : ""}\n${t.summary}\n${t.steps.map((s) => `- ${s}`).join("\n")}`).join("\n\n");
}

const STOP = new Set("the a an and or of to in on for is are can do does how i my me we you your it this that with what when where why".split(" "));
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Best-matching topics for a question. Used when the bot is off and to attach links to bot answers. */
export function findTopics(question: string, role: Role, n = 2): Topic[] {
  const q = new Set(words(question));
  if (!q.size) return [];
  return forRole(role)
    .map((t) => {
      const title = new Set(words(t.title)); const body = new Set(words(`${t.summary} ${t.steps.join(" ")}`));
      let score = 0;
      for (const w of q) { if (title.has(w)) score += 3; else if (body.has(w)) score += 1; }
      return { t, score };
    })
    .filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.t);
}
