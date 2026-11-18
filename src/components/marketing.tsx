import Link from "next/link";
import { ProLytMark } from "@/components/brand";
import { PlayerCard } from "@/components/player-card";
import { TiltCard } from "@/components/tilt-card";
import { PLUS_MONTHLY_CENTS, PLUS_YEARLY_CENTS, PLUS_TRIAL_DAYS } from "@/lib/plans";

// ProLyt's own front door (prolyt.app with no program on it). Programs get their own branded welcome instead.
const contact = () => (process.env.SUPPORT_EMAIL ? `mailto:${process.env.SUPPORT_EMAIL}?subject=${encodeURIComponent("Start a program on ProLyt")}` : "/login");
const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

const TICKER = ["Verified by coaches", "Earned, not bought", "Parent approved", "Ratings can't be bought", "Private by default", "Built with Game-Fit Loomis"];

const WAYS = [
  { who: "Athletes 13+", title: "Build your record", text: "Verified 40s and verticals, film, coach ratings and a card you will actually post. One link for recruiters.", cta: "Build my card", href: "/login" },
  { who: "Parents", title: "See your kid get better", text: "Book and pay in a few taps, follow every result, and approve everything. Under-13s have no login of their own.", cta: "Find my program", href: "/login" },
  { who: "Programs", title: "Run it. Prove it.", text: "Booking, payments, waitlists and testing in one app, with your name on every screen.", cta: "Start a program", href: "" },
] as const;

const SHOTS = [
  { src: "/marketing/card.jpg", title: "The card", text: "Earned, never bought. Only verified tests and coach ratings move it." },
  { src: "/marketing/progress.jpg", title: "The proof", text: "Every result charted against the athlete's own best, with coach notes underneath." },
  { src: "/marketing/schedule.jpg", title: "The schedule", text: "Book, buy a pack and join a waitlist in a few taps." },
  { src: "/marketing/arena.jpg", title: "The Arena", text: "Rankings by position and age, for athletes 13+ whose parents opted in." },
  { src: "/marketing/roster.jpg", title: "The coach board", text: "Who has never been tested, who is due for a retest, in one glance." },
] as const;

const STEPS = [
  ["Get tested", "A coach logs a 40, a shuttle or a vertical. A few taps, or just say it out loud."],
  ["Level up", "The rating moves. Verified numbers carry a check, so nobody can fake it."],
  ["Share it", "Save the card, post it, send the link. Friends ask where to sign up."],
  ["Beat it", "Every retest is a chance at a better card and a new personal best."],
] as const;

const WINS = [
  ["Get paid before they show up", "Session packs prepay a block of sessions. Credits work across siblings, so nobody argues about discounts."],
  ["Full sessions stay full", "A cancellation offers the spot to the next family on the waitlist right away. No more texting five parents."],
  ["No-shows get a nudge", "Autopilot messages families who missed a session or went quiet, in your program's name."],
  ["Coaches paid without you playing bank", "Coaches set up their own Stripe payouts in minutes. You stop sending Zelle on Fridays."],
  ["It looks like your program", "Your name, logo and colors at yourname.prolyt.app. ProLyt stays quietly in the footer."],
  ["Events when you want them", "Divisions, waivers, QR check-in, brackets and live scores for tournaments and camps."],
] as const;

const SAFE = [
  ["No login under 13", "A parent owns the account. Under-13 athletes are never named on a public board."],
  ["Rankings are opt-in", "Only athletes 13+ with a parent opt-in appear, and only on boards with at least 3."],
  ["Packs are earned", "Card packs come from effort and results. They are never sold."],
  ["Private by default", "Goals, notes and results stay with the family and the coaches who test the athlete."],
] as const;

const FAQ = [
  ["Who is ProLyt for?", "Young athletes and the programs that train them: clubs, trainers, camps and teams. It was built first with Game-Fit Loomis football."],
  ["Is it free for families?", `Yes. Registering, booking, following results and getting your card are free. ProLyt+ is optional: ${dollars(PLUS_MONTHLY_CENTS)} a month or ${dollars(PLUS_YEARLY_CENTS)} a year for every athlete in the family.`],
  ["What does a program pay?", "We set programs up one on one and walk you through pricing before you launch. Talk to us."],
  ["How is this different from a scheduling app?", "Scheduling apps tell you who showed up. ProLyt also tells you who improved: verified testing, a Player Card, goals and film, tied to the account families already use to book."],
  ["Do coaches get paid through it?", "Yes. Coaches set up payouts with Stripe from their Get set up page. Stripe may charge fees on payouts."],
  ["Is it safe for kids?", "Under-13 athletes have no login and are never named publicly. Rankings are opt-in. Read the privacy policy for the details."],
  ["Does it work for sports other than football?", "The testing, booking and card system works for other sports. Football is where it is most polished today."],
] as const;

export function Marketing() {
  const cta = contact();
  const btn = "flex min-h-14 items-center justify-center rounded-md px-7 font-cond text-[18px] font-extrabold uppercase tracking-[2px]";
  const eyebrow = "font-cond text-sm font-bold uppercase tracking-[4px] text-gold";
  const h2 = "mt-2 font-display text-[40px] uppercase leading-[0.98] sm:text-6xl";
  return (
    <div className="min-h-dvh overflow-x-clip bg-ink text-cream">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <ProLytMark className="text-2xl" />
          <nav aria-label="Site" className="flex items-center gap-1 text-sm">
            <a href="#cards" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">The card</a>
            <a href="#programs" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">Programs</a>
            <a href="#pricing" className="hidden min-h-11 items-center px-3 text-soft hover:text-cream sm:flex">Pricing</a>
            <Link href="/login" className="flex min-h-11 items-center rounded-md border border-line bg-ink/60 px-4 font-semibold hover:border-gold">Sign in</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative isolate overflow-hidden pt-24 sm:pt-28">
          <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 50% at 70% 40%, rgba(248,196,10,0.16), transparent 70%), radial-gradient(50% 50% at 15% 80%, rgba(53,212,255,0.10), transparent 70%)" }} />
          <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-[0.07]" style={{ background: "repeating-linear-gradient(115deg, #fff 0 2px, transparent 2px 46px)" }} />
          <div className="mx-auto grid max-w-6xl items-center gap-4 px-5 pb-16 md:grid-cols-[1fr_1.05fr] md:pb-24">
            <div className="flex flex-col gap-6">
              <p className={eyebrow}>ProLyt · Series 1</p>
              <h1 className="font-display text-[68px] uppercase leading-[0.88] sm:text-[112px]">
                Earn<br />your<br /><span className="text-gold">card.</span>
              </h1>
              <p className="max-w-md text-lg text-soft">Verified 40s. Real film. Coach ratings. One card that levels up every time you get tested, and a record nobody can fake. Free for families.</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className={`${btn} bg-gold text-on-gold`}>Build my card</Link>
                <Link href="/start/program" className={`${btn} border border-line hover:border-gold`}>Run a program</Link>
              </div>
              <p className="text-sm text-muted">Parents: open your program&apos;s ProLyt link to register your athlete.</p>
            </div>
            <div className="relative mx-auto h-[330px] w-full max-w-[560px] sm:h-[560px]" aria-label="Four ProLyt card finishes">
              <div className="absolute left-[2%] top-[10%] w-[40%] -rotate-[9deg]">
                <TiltCard finish="black"><PlayerCard size="sm" tier="mvp" first="Your" last="Athlete" position="OL" grad={null} photo={null} ovr={null} attrs={null} series="ProLyt" team="Your Program" number="7" /></TiltCard>
              </div>
              <div className="absolute right-[2%] top-[4%] w-[40%] rotate-[8deg]">
                <TiltCard finish="gold"><PlayerCard size="sm" tier="champion" first="Your" last="Athlete" position="WR" grad={null} photo={null} ovr={88} attrs={null} series="40 YD · 4.62" badge="PR" team="Your Program" number="7" /></TiltCard>
              </div>
              <div className="absolute left-1/2 top-[18%] z-10 w-[46%] -translate-x-1/2 drop-shadow-[0_30px_50px_rgba(0,0,0,0.7)]">
                <TiltCard finish="chrome"><PlayerCard size="sm" tier="player" first="Your" last="Athlete" position="ATH" grad={null} photo={null} ovr={84} attrs={null} series="ProLyt" team="Your Program" number="7" foil firstCard /></TiltCard>
              </div>
            </div>
          </div>
        </section>

        {/* TICKER */}
        <div aria-hidden="true" className="overflow-hidden border-y border-gold/40 bg-gold py-3 text-on-gold">
          <div className="marquee flex w-max gap-10 whitespace-nowrap font-cond text-base font-extrabold uppercase tracking-[4px]">
            {[...TICKER, ...TICKER, ...TICKER, ...TICKER].map((t, i) => <span key={i} className="flex items-center gap-10">{t}<span>◆</span></span>)}
          </div>
        </div>

        {/* THREE DOORS */}
        <section className="mx-auto grid max-w-6xl gap-4 px-5 py-16 md:grid-cols-3">
          {WAYS.map((w) => (
            <article key={w.who} className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-6 transition hover:border-gold">
              <p className={eyebrow}>{w.who}</p>
              <h2 className="font-display text-[30px] uppercase leading-none">{w.title}</h2>
              <p className="flex-1 text-sm text-soft">{w.text}</p>
              <a href={w.href || cta} className="mt-2 inline-flex min-h-11 items-center font-bold text-gold">{w.cta} →</a>
            </article>
          ))}
        </section>

        {/* THE CARD */}
        <section id="cards" className="scroll-mt-4 border-y border-line bg-panel/50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <p className={eyebrow}>The card</p>
            <h2 className={h2}>Four finishes.<br />All of them earned.</h2>
            <p className="mt-4 max-w-xl text-soft">Every athlete starts with a Chrome card. Better finishes come from personal bests, titles and signing it. Nobody can buy a rating.</p>
            <div className="-mx-5 mt-10 flex snap-x gap-6 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
              {([
                ["Chrome", "Your first card. Every athlete starts here.", "chrome", <PlayerCard key="a" size="sm" tier="player" first="Your" last="Athlete" position="ATH" grad={null} photo={null} ovr={72} attrs={null} series="ProLyt" team="Your Program" number="7" firstCard />],
                ["Champion", "A personal best or an event title.", "gold", <PlayerCard key="b" size="sm" tier="champion" first="Your" last="Athlete" position="WR" grad={null} photo={null} ovr={88} attrs={null} series="40 YD · 4.62" badge="PR" team="Your Program" number="7" />],
                ["Black Chrome", "Tournament MVP. The rare one.", "black", <PlayerCard key="c" size="sm" tier="mvp" first="Your" last="Athlete" position="OL" grad={null} photo={null} ovr={null} attrs={null} series="ProLyt" team="Your Program" number="7" />],
                ["Signed", "Autographed by the athlete and numbered.", "base", <PlayerCard key="d" size="sm" tier="signed" first="Your" last="Athlete" position="QB" grad={null} photo={null} ovr={null} attrs={null} series="ProLyt" team="Your Program" number="7" serial="07/25" />],
              ] as const).map(([name, text, finish, card]) => (
                <figure key={name} className="w-[230px] flex-none snap-start md:w-auto">
                  <TiltCard finish={finish}>{card}</TiltCard>
                  <figcaption className="mt-4"><span className="block font-display text-2xl uppercase leading-none">{name}</span><span className="mt-1 block text-sm text-soft">{text}</span></figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* HOW */}
        <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <p className={eyebrow}>How it works</p>
          <h2 className={h2}>Test it. Level up.<br />Show it off. Beat it.</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map(([h, t], i) => (
              <li key={h} className="relative overflow-hidden rounded-[18px] border border-line bg-panel p-6">
                <span aria-hidden="true" className="absolute -right-2 -top-4 font-display text-[110px] leading-none text-gold/15">{i + 1}</span>
                <span className="relative block font-display text-2xl uppercase leading-none">{h}</span>
                <span className="relative mt-2 block text-sm text-soft">{t}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* THE APP */}
        <section id="product" className="scroll-mt-4 border-y border-line bg-panel/50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <p className={eyebrow}>The app</p>
            <h2 className={h2}>Real screens.<br />Real progress.</h2>
            <p className="mt-3 text-sm text-muted">Screens from the app, with sample data.</p>
            <div className="-mx-5 mt-10 flex snap-x gap-5 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
              {SHOTS.map((s) => (
                <figure key={s.src} className="w-[240px] flex-none snap-start md:w-auto">
                  <div className="overflow-hidden rounded-[26px] border-4 border-line bg-panel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.title} width={780} height={1560} loading="lazy" className="block h-auto w-full" />
                  </div>
                  <figcaption className="mt-3"><span className="block font-semibold">{s.title}</span><span className="mt-1 block text-sm text-soft">{s.text}</span></figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* PROGRAMS */}
        <section id="programs" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-16 md:py-24">
          <p className={eyebrow}>For programs</p>
          <h2 className={h2}>Get paid.<br />Stay full. Stop chasing.</h2>
          <p className="mt-4 max-w-xl text-soft">Scheduling apps tell you who showed up. ProLyt tells you who improved, and gives every family a reason to renew.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {WINS.map(([h, t]) => <div key={h} className="rounded-[16px] border border-line bg-panel p-5"><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-soft">{t}</p></div>)}
          </div>
          <Link href="/start/program" className={`${btn} mt-8 w-full bg-gold text-on-gold sm:w-auto`}>Start a program</Link>
        </section>

        {/* TRUST */}
        <section id="safe" className="scroll-mt-4 border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <p className={eyebrow}>Trust</p>
            <h2 className={h2}>Careful with kids,<br />on purpose.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {SAFE.map(([h, t]) => <div key={h} className="rounded-[14px] border border-line bg-ink p-5"><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-soft">{t}</p></div>)}
            </div>
            <p className="mt-4 text-sm text-muted">Read the <Link href="/legal/privacy" className="font-semibold text-gold">privacy policy</Link> and <Link href="/legal/participation" className="font-semibold text-gold">terms</Link>.</p>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-16 md:py-24">
          <p className={eyebrow}>Pricing</p>
          <h2 className={h2}>Free to start.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-[18px] border border-line bg-panel p-6">
              <p className={eyebrow}>Families</p>
              <p className="mt-2 font-display text-6xl leading-none">Free</p>
              <p className="mt-3 text-sm text-soft">Register, book, pay, follow every result and get your Chrome card.</p>
            </div>
            <div className="rounded-[18px] border-2 border-gold bg-gold/10 p-6">
              <p className={eyebrow}>ProLyt+</p>
              <p className="mt-2 font-display text-6xl leading-none">{dollars(PLUS_MONTHLY_CENTS)}<span className="text-2xl text-soft"> / mo</span></p>
              <p className="mt-3 text-sm text-soft">Full card with all six ratings, the gold foil finish, recruiting alerts and video uploads. {dollars(PLUS_YEARLY_CENTS)} a year. One plan covers every athlete in your family.{PLUS_TRIAL_DAYS ? ` ${PLUS_TRIAL_DAYS}-day free trial.` : ""}</p>
            </div>
            <div className="rounded-[18px] border border-line bg-panel p-6">
              <p className={eyebrow}>Programs</p>
              <p className="mt-2 font-display text-6xl leading-none">Let&apos;s talk</p>
              <p className="mt-3 text-sm text-soft">We set you up one on one and walk through pricing before you launch.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-4 px-5 pb-16">
          <h2 className={h2}>Questions</h2>
          <div className="mt-6 flex flex-col gap-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-[14px] border border-line bg-panel px-4 open:border-gold/50">
                <summary className="flex min-h-14 cursor-pointer items-center py-3 font-semibold">{q}</summary>
                <p className="pb-4 text-sm text-soft">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="relative isolate overflow-hidden border-t border-gold/40 py-20 text-center">
          <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: "radial-gradient(50% 80% at 50% 100%, rgba(248,196,10,0.22), transparent 70%)" }} />
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="font-display text-[48px] uppercase leading-[0.95] sm:text-7xl">Your first card is <span className="text-gold">free.</span></h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className={`${btn} bg-gold text-on-gold`}>Build my card</Link>
              <Link href="/start/program" className={`${btn} border border-line hover:border-gold`}>Run a program</Link>
            </div>
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
