import Link from "next/link";
import { ProLytMark } from "@/components/brand";
import { PlayerCard } from "@/components/player-card";
import { feePercent } from "@/lib/fees";

// ProLyt's own front door (prolyt.app with no program on it). Programs get their own branded welcome instead.
const contact = () => (process.env.SUPPORT_EMAIL ? `mailto:${process.env.SUPPORT_EMAIL}?subject=${encodeURIComponent("Start a program on ProLyt")}` : "/login");

const ROLES = [
  { who: "Families", line: "See the kid, not just the schedule.", points: ["Book sessions, camps and packs, and join a waitlist when it's full", "A Player Card that levels up with every verified result", "Goals, film and coach notes in one place", "Parents approve everything for kids under 13"] },
  { who: "Coaches", line: "Log it once. It goes everywhere.", points: ["Run testing day from the roster board: who's due, who's improved", "Voice or batch result entry in a few taps", "Private goals per athlete, never printed on a card", "Get paid through Stripe, set up in minutes"] },
  { who: "Program owners", line: "Run the whole program from your phone.", points: ["Schedules, bookings, session packs and payments", "Waitlists that fill empty spots on their own", "Your logo, colors and address: yourname.prolyt.app", "Autopilot nudges for no-shows and families going quiet"] },
];

const FEATURES = [
  ["Player Card", "Verified speed, agility and power turn into a rating, a position and a collectible card kids actually want."],
  ["Testing that sticks", "Every result is measured by a coach and shown with a check. Progress is charted against the athlete's own best."],
  ["Booking and packs", "Sessions, camps and multi-session packs with credits that families can share across siblings."],
  ["Waitlist", "A cancellation offers the spot to the next family right away, held for a fair window."],
  ["Arena", "Rankings for athletes 13 and up whose parents opted in. Younger athletes are never named."],
  ["Ask ProLyt", "A built-in guide and help bot that answers from the guide, and says so when it doesn't know."],
  ["Events", "Divisions, waivers, QR check-in, brackets and live scores for tournaments and camps."],
  ["Your brand", "Your name, logo and colors on every screen. ProLyt stays quietly in the footer."],
] as const;

const SAFE = [
  ["Kids under 13 have no login", "A parent owns the account. Under-13 athletes are never named on a public board."],
  ["Opt-in rankings", "Only athletes 13 and up with a parent's opt-in appear, and only when a board has at least 3."],
  ["Packs are earned", "Card packs come from effort and results. They are never sold."],
  ["Private by default", "Goals, notes and results stay with the family and the coaches who test the athlete."],
  ["No NIL until it's reviewed", "School names, mascots and team affiliations are kept off cards, and payouts stay locked until an attorney signs off."],
] as const;

const STEPS = [
  ["Tell us about your program", "Name, sports, ages, and how you charge today."],
  ["We set it up with you", "Your brand, your plans and your first sessions, ready to open."],
  ["Invite coaches and families", "Coaches get a one-tap invite. Families register from your link."],
];

const FAQ = [
  ["Who is ProLyt for?", "Youth and high school sports programs that want one app for booking, payments and athlete development. It was built first with Game-Fit Loomis football."],
  ["What does it cost?", `Programs pay a ${feePercent()} platform fee on payments taken through ProLyt, plus Stripe's card processing. Families can optionally add ProLyt+. Talk to us for anything beyond that.`],
  ["Do coaches get paid through it?", "Yes. Coaches set up payouts with Stripe from their Get set up page. Stripe may charge fees on payouts."],
  ["Is it safe for kids?", "Under-13 athletes have no login and are never named publicly. Rankings are opt-in. Read the privacy policy for the details."],
  ["Does it work for sports other than football?", "The testing, booking and card system works for other sports. Football is where it is most polished today."],
] as const;

export function Marketing() {
  const cta = contact();
  return (
    <div className="min-h-dvh bg-ink text-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <ProLytMark className="text-2xl" />
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">How it works</a>
          <a href="#pricing" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">Pricing</a>
          <a href="#faq" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">FAQ</a>
          <Link href="/login" className="flex min-h-11 items-center rounded-md border border-line px-4 font-semibold hover:border-gold">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.15fr_0.85fr] md:pt-16">
          <div className="flex flex-col gap-5">
            <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">Athlete development platform</p>
            <h1 className="font-display text-[56px] uppercase leading-[0.92] sm:text-[84px]">
              Train it.<br />Track it.<br /><span className="text-gold">ProLyt.</span>
            </h1>
            <p className="max-w-xl text-lg text-soft">The app that runs your youth sports program and builds every athlete&apos;s record: booking, payments, verified testing, film and a Player Card that levels up.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href={cta} className="flex min-h-14 items-center justify-center rounded-md bg-gold px-6 font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Start a program</a>
              <Link href="/login" className="flex min-h-14 items-center justify-center rounded-md border border-line px-6 font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] hover:border-gold">Parent or coach sign in</Link>
            </div>
            <p className="text-sm text-muted">Built with Game-Fit Loomis. Parents: open your program&apos;s ProLyt link to register your athlete.</p>
          </div>
          <div aria-hidden="true" className="relative flex justify-center py-4">
            <span className="absolute inset-x-8 top-1/2 h-2/3 -translate-y-1/2 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative w-[62%] max-w-[300px] -rotate-[4deg] drop-shadow-[0_24px_40px_rgba(0,0,0,0.65)]">
              <PlayerCard size="sm" tier="player" first="Your" last="Athlete" position="ATH" grad={null} photo={null} ovr={84} attrs={null} series="ProLyt" team="Your Program" number="7" foil />
            </div>
          </div>
        </section>

        <section aria-label="Who it is for" className="mx-auto grid max-w-6xl gap-4 px-5 pb-16 md:grid-cols-3">
          {ROLES.map((r) => (
            <article key={r.who} className="flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
              <p className="font-cond text-sm font-bold uppercase tracking-[2px] text-gold">{r.who}</p>
              <h2 className="font-display text-[26px] uppercase leading-none">{r.line}</h2>
              <ul className="flex flex-col gap-2 text-sm text-soft">
                {r.points.map((p) => <li key={p} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-gold" />{p}</li>)}
              </ul>
            </article>
          ))}
        </section>

        <section className="border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-4xl uppercase leading-none">Everything a program needs</h2>
            <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(([h, t]) => <div key={h}><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-soft">{t}</p></div>)}
            </div>
          </div>
        </section>

        <section id="safe" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-16">
          <h2 className="font-display text-4xl uppercase leading-none">Built for kids, so it is built careful</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {SAFE.map(([h, t]) => <div key={h} className="rounded-[14px] border border-line p-5"><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-soft">{t}</p></div>)}
          </div>
          <p className="mt-4 text-sm text-muted">Read the <Link href="/legal/privacy" className="font-semibold text-gold">privacy policy</Link> and <Link href="/legal/participation" className="font-semibold text-gold">terms</Link>.</p>
        </section>

        <section id="how" className="scroll-mt-4 border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-4xl uppercase leading-none">Open your program in three steps</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map(([h, t], i) => (
                <li key={h} className="flex gap-4 rounded-[14px] border border-line bg-ink p-5">
                  <span className="font-display text-4xl leading-none text-gold">{i + 1}</span>
                  <span><span className="block font-semibold">{h}</span><span className="mt-1 block text-sm text-soft">{t}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-16">
          <h2 className="font-display text-4xl uppercase leading-none">Simple pricing</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[16px] border-2 border-gold bg-gold/10 p-6">
              <p className="font-cond text-sm font-bold uppercase tracking-[2px] text-gold">For programs</p>
              <p className="mt-2 font-display text-5xl leading-none">{feePercent()}</p>
              <p className="mt-2 text-sm text-soft">platform fee on payments taken through ProLyt, plus Stripe&apos;s card processing. Your program or the family can cover it.</p>
            </div>
            <div className="rounded-[16px] border border-line p-6">
              <p className="font-cond text-sm font-bold uppercase tracking-[2px] text-gold">For families</p>
              <p className="mt-2 font-display text-5xl leading-none">Free</p>
              <p className="mt-2 text-sm text-soft">to register, book and follow your athlete. ProLyt+ is an optional upgrade.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-4 px-5 pb-16">
          <h2 className="font-display text-4xl uppercase leading-none">Questions</h2>
          <div className="mt-6 flex flex-col gap-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-[14px] border border-line bg-panel px-4 open:border-gold/50">
                <summary className="flex min-h-14 cursor-pointer items-center py-3 font-semibold">{q}</summary>
                <p className="pb-4 text-sm text-soft">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] border-2 border-gold bg-gold/10 p-8 md:flex-row md:items-center">
            <h2 className="font-display text-4xl uppercase leading-none">Ready to run your program on ProLyt?</h2>
            <a href={cta} className="flex min-h-14 flex-none items-center justify-center rounded-md bg-gold px-6 font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Start a program</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row">
          <ProLytMark className="text-xl text-cream" />
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/legal/privacy" className="flex min-h-11 items-center hover:text-cream">Privacy</Link>
            <Link href="/legal/participation" className="flex min-h-11 items-center hover:text-cream">Terms</Link>
            <Link href="/login" className="flex min-h-11 items-center hover:text-cream">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
