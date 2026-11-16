import Link from "next/link";
import { ProLytMark } from "@/components/brand";
import { PlayerCard } from "@/components/player-card";
import { feePercent } from "@/lib/fees";

// ProLyt's own front door (prolyt.app with no program on it). Programs get their own branded welcome instead.
const contact = () => (process.env.SUPPORT_EMAIL ? `mailto:${process.env.SUPPORT_EMAIL}?subject=${encodeURIComponent("Start a program on ProLyt")}` : "/login");


const SHOTS = [
  { src: "/marketing/card.jpg", title: "The card kids want to show off", text: "Earned, never bought. Only verified tests and coach ratings move it, so the number means something." },
  { src: "/marketing/progress.jpg", title: "Proof parents can see", text: "Every result charted against the athlete's own best, with your coach notes right underneath." },
  { src: "/marketing/schedule.jpg", title: "Booking that fills itself", text: "Families book, buy a pack and join a waitlist in a few taps. You see spots left, not a spreadsheet." },
  { src: "/marketing/roster.jpg", title: "Know who is due in one glance", text: "The coach board flags kids who have never been tested or have gone 30 days without a retest." },
  { src: "/marketing/arena.jpg", title: "Healthy competition, parent approved", text: "Rankings by position and age for athletes 13 and up whose parents opted in. Younger kids are never named." },
] as const;

const TODAY = [
  "Payments live in Venmo screenshots and a notebook.",
  "Sign-ups live in a Google Form and a group chat.",
  "Times live in a spreadsheet nobody opens twice.",
  "Parents ask \"is he actually getting better?\" and you answer from memory.",
];

const LOOP = [
  ["Test", "A coach logs a 40, a shuttle or a vertical. It takes a few taps, or just say it out loud."],
  ["Level up", "The athlete's card and rating move. Verified numbers show a check."],
  ["Show off", "The athlete shares the card. Friends ask which program that is."],
  ["Re-book", "Parents see the growth, buy the next pack, and tell the neighbors."],
] as const;

const WINS = [
  ["Get paid before they show up", "Session packs prepay a block of sessions. Credits work across siblings, so nobody argues about discounts. Checkout runs through Stripe."],
  ["Full sessions stay full", "A cancellation offers the spot to the next family on the waitlist right away, held for a fair window. No more texting five parents."],
  ["No-shows get a nudge, not a lecture", "Autopilot messages families who missed a session or went quiet, in your program's name."],
  ["Coaches get paid without you playing bank", "Coaches set up their own Stripe payouts in minutes. You stop sending Zelle on Fridays."],
  ["It looks like your program", "Your name, logo and colors, at yourname.prolyt.app. ProLyt stays quietly in the footer."],
  ["Events when you want them", "Divisions, waivers, QR check-in, brackets and live scores for tournaments and camps."],
] as const;

const SAFE = [
  ["Kids under 13 have no login", "A parent owns the account. Under-13 athletes are never named on a public board."],
  ["Rankings are opt-in", "Only athletes 13 and up with a parent opt-in appear, and only when a board has at least 3."],
  ["Packs are earned", "Card packs come from effort and results. They are never sold."],
  ["Private by default", "Goals, notes and results stay with the family and the coaches who test the athlete."],
] as const;

const FAQ = [
  ["Who is ProLyt for?", "Youth and high school sports programs, trainers and camps that want one app for booking, payments and athlete development. It was built first with Game-Fit Loomis football."],
  ["How is this different from a scheduling app?", "Scheduling apps tell you who showed up. ProLyt also tells you who improved: verified testing, a Player Card, goals and film, tied to the same account families already use to book."],
  ["What does it cost?", `Programs pay a ${feePercent()} platform fee on payments taken through ProLyt, plus Stripe's card processing. Families can optionally add ProLyt+. Talk to us for anything beyond that.`],
  ["Do coaches get paid through it?", "Yes. Coaches set up payouts with Stripe from their Get set up page. Stripe may charge fees on payouts."],
  ["Is it safe for kids?", "Under-13 athletes have no login and are never named publicly. Rankings are opt-in. Read the privacy policy for the details."],
  ["Does it work for sports other than football?", "The testing, booking and card system works for other sports. Football is where it is most polished today."],
] as const;

export function Marketing() {
  const cta = contact();
  const btn = "flex min-h-14 items-center justify-center rounded-md px-6 font-cond text-[17px] font-extrabold uppercase tracking-[1.5px]";
  return (
    <div className="min-h-dvh bg-ink text-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <ProLytMark className="text-2xl" />
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <a href="#product" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">See it</a>
          <a href="#pricing" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">Pricing</a>
          <a href="#faq" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">FAQ</a>
          <Link href="/login" className="flex min-h-11 items-center rounded-md border border-line px-4 font-semibold hover:border-gold">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.2fr_0.8fr] md:pt-16">
          <div className="flex flex-col gap-5">
            <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">The app for youth sports programs</p>
            <h1 className="font-display text-[48px] uppercase leading-[0.95] sm:text-[76px]">
              Your athletes are getting better. <span className="text-gold">Prove it.</span>
            </h1>
            <p className="max-w-xl text-lg text-soft">ProLyt runs your booking, payments and waitlist, then turns every test and session into a Player Card kids show off and parents keep checking. Families stay. Spots fill. You stop chasing.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href={cta} className={`${btn} bg-gold text-on-gold`}>Start a program</a>
              <a href="#product" className={`${btn} border border-line hover:border-gold`}>See the app</a>
            </div>
            <p className="text-sm text-muted">Built with Game-Fit Loomis football. Parents: open your program&apos;s ProLyt link to register, or <Link href="/login" className="font-semibold text-gold">sign in</Link>.</p>
          </div>
          <div aria-hidden="true" className="relative flex justify-center py-4">
            <span className="absolute inset-x-8 top-1/2 h-2/3 -translate-y-1/2 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative w-[62%] max-w-[300px] -rotate-[4deg] drop-shadow-[0_24px_40px_rgba(0,0,0,0.65)]">
              <PlayerCard size="sm" tier="player" first="Your" last="Athlete" position="ATH" grad={null} photo={null} ovr={84} attrs={null} series="ProLyt" team="Your Program" number="7" foil />
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-panel/50 py-14">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 md:grid-cols-2">
            <div>
              <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">Right now</p>
              <h2 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Four tools and a guess</h2>
              <p className="mt-4 text-soft">ProLyt is the one place all four live, and the proof updates itself every time a coach logs a result.</p>
            </div>
            <ul className="flex flex-col gap-3">
              {TODAY.map((t) => <li key={t} className="flex gap-3 rounded-[12px] border border-line bg-ink px-4 py-3 text-soft"><span aria-hidden="true" className="font-bold text-bad">✕</span>{t}</li>)}
            </ul>
          </div>
        </section>

        <section id="product" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-16">
          <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">The app</p>
          <h2 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">What your families and coaches see</h2>
          <p className="mt-3 text-sm text-muted">Real screens from the app, with sample data.</p>
          <div className="-mx-5 mt-8 flex snap-x gap-5 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
            {SHOTS.map((s) => (
              <figure key={s.src} className="w-[240px] flex-none snap-start md:w-auto">
                <div className="overflow-hidden rounded-[26px] border-4 border-line bg-panel">
                  <img src={s.src} alt={s.title} width={780} height={1560} loading="lazy" className="block h-auto w-full" />
                </div>
                <figcaption className="mt-3"><span className="block font-semibold">{s.title}</span><span className="mt-1 block text-sm text-soft">{s.text}</span></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">Why families stay</p>
            <h2 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Scheduling apps tell you who showed up. ProLyt tells you who improved.</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-4">
              {LOOP.map(([h, t], i) => (
                <li key={h} className="rounded-[14px] border border-line bg-ink p-5">
                  <span className="font-display text-4xl leading-none text-gold">{i + 1}</span>
                  <span className="mt-2 block font-semibold">{h}</span>
                  <span className="mt-1 block text-sm text-soft">{t}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">Then it starts over, with a better number to beat.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">For the person running it</p>
          <h2 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Get paid. Stay full. Stop chasing.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {WINS.map(([h, t]) => <div key={h} className="rounded-[14px] border border-line bg-panel p-5"><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-soft">{t}</p></div>)}
          </div>
        </section>

        <section id="safe" className="scroll-mt-4 border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <p className="font-cond text-sm font-bold uppercase tracking-[3px] text-gold">Trust</p>
            <h2 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Careful with kids, on purpose</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {SAFE.map(([h, t]) => <div key={h} className="rounded-[14px] border border-line bg-ink p-5"><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-soft">{t}</p></div>)}
            </div>
            <p className="mt-4 text-sm text-muted">Read the <Link href="/legal/privacy" className="font-semibold text-gold">privacy policy</Link> and <Link href="/legal/participation" className="font-semibold text-gold">terms</Link>.</p>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-16">
          <h2 className="font-display text-4xl uppercase leading-none sm:text-5xl">Simple pricing</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[16px] border-2 border-gold bg-gold/10 p-6">
              <p className="font-cond text-sm font-bold uppercase tracking-[2px] text-gold">For programs</p>
              <p className="mt-2 font-display text-5xl leading-none">{feePercent()}</p>
              <p className="mt-2 text-sm text-soft">platform fee on payments taken through ProLyt, plus Stripe&apos;s card processing. Your program or the family can cover it. No payments, no fee.</p>
            </div>
            <div className="rounded-[16px] border border-line p-6">
              <p className="font-cond text-sm font-bold uppercase tracking-[2px] text-gold">For families</p>
              <p className="mt-2 font-display text-5xl leading-none">Free</p>
              <p className="mt-2 text-sm text-soft">to register, book and follow your athlete. ProLyt+ is an optional upgrade.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-4 px-5 pb-16">
          <h2 className="font-display text-4xl uppercase leading-none sm:text-5xl">Questions</h2>
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
            <div>
              <h2 className="font-display text-4xl uppercase leading-none sm:text-5xl">Give every athlete a reason to come back.</h2>
              <p className="mt-3 text-soft">We will set up your program with you.</p>
            </div>
            <a href={cta} className={`${btn} flex-none bg-gold text-on-gold`}>Start a program</a>
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
