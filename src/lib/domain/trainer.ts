// ProLyt Trainer: a personal at-home program built from the athlete's own Player Card.
// Pure and deterministic, so it's testable and the same athlete gets the same week every time they look.
//
// How it decides:
//   1. Focus: the two trainable attributes (speed, agility, explosiveness, strength) where getting better moves
//      the card most: the gap to elite for their age, weighted by what their position needs.
//   2. Level 1–3 per athlete: starts from age, goes up every 6 workouts they finish.
//   3. Three ~20-minute workouts a week: A leans on focus 1, B on focus 2, C mixes both. Each adds one
//      position skill and a core finisher. Drills rotate week to week inside the right level.
// Safety: bodyweight and cones only, no weights. Jump volume is capped by age. Every workout says to stop if
// something hurts. Nothing here touches the rating: only coach-verified tests do.

import { ATTRS, positionGroup, WEIGHTS, type Attr, type Rating } from "./rating";

export type Drill = {
  id: string; name: string; attr: Attr | "pos" | "core" | "warm";
  /** Position groups this skill drill is for (pos drills only). */
  groups?: string[];
  level: 1 | 2 | 3; minAge: number;
  /** Dose by level: [sets, reps or seconds]. */
  dose: string[];
  cue: string;
  needs?: "cones" | "wall" | "ball" | "partner";
  jumps?: number; // foot contacts per set, for the age cap
};

const D = (d: Drill) => d;

export const DRILLS: Drill[] = [
  // Speed
  D({ id: "wall-march", name: "Wall drive march", attr: "spd", level: 1, minAge: 8, dose: ["3 × 10 each leg", "3 × 12 each leg", "4 × 12 each leg"], cue: "Lean into the wall, knee drives up, toe up. Push the ground back.", needs: "wall" }),
  D({ id: "a-skip", name: "A-skips", attr: "spd", level: 1, minAge: 8, dose: ["3 × 15 yd", "4 × 20 yd", "4 × 20 yd"], cue: "Tall posture. Knee to hip height, strike down under your hip." }),
  D({ id: "falling-start", name: "Falling starts", attr: "spd", level: 1, minAge: 8, dose: ["4 × 10 yd", "5 × 10 yd", "6 × 10 yd"], cue: "Lean until you have to step, then sprint. First 3 steps short and violent." }),
  D({ id: "build-ups", name: "Build-up sprints", attr: "spd", level: 2, minAge: 10, dose: ["3 × 30 yd", "4 × 40 yd", "5 × 40 yd"], cue: "Build to 90% by the end. Relax your face and hands. Walk back to rest." }),
  D({ id: "3pt-starts", name: "3-point starts", attr: "spd", level: 2, minAge: 11, dose: ["4 × 10 yd", "5 × 10 yd", "6 × 15 yd"], cue: "Weight on your down hand. Push out low, arms punch hard for the first 5 yards." }),
  D({ id: "flying-10", name: "Flying 10s", attr: "spd", level: 3, minAge: 13, dose: ["3 reps", "4 reps", "5 reps"], cue: "20 yd build-in, then 10 yd all-out. Full rest between (90 sec)." , needs: "cones" }),
  D({ id: "hill-sprint", name: "Hill or stair sprints", attr: "spd", level: 3, minAge: 13, dose: ["4 × 10 sec", "5 × 10 sec", "6 × 10 sec"], cue: "Drive knees, stay tall. Walk down to rest." }),
  // Agility
  D({ id: "line-hops", name: "Quick line hops", attr: "agi", level: 1, minAge: 8, dose: ["3 × 15 sec", "3 × 20 sec", "4 × 20 sec"], cue: "Side to side over a line. Light and quick on the balls of your feet.", jumps: 20 }),
  D({ id: "shuffle", name: "Lateral shuffle", attr: "agi", level: 1, minAge: 8, dose: ["3 × 10 yd each way", "4 × 10 yd each way", "4 × 15 yd each way"], cue: "Stay low, feet never click together, chest up." }),
  D({ id: "drop-step", name: "Drop step and go", attr: "agi", level: 1, minAge: 9, dose: ["3 × 4 each side", "4 × 4 each side", "4 × 5 each side"], cue: "Open the hip, step back and turn, sprint 5 yards." }),
  D({ id: "5-10-5", name: "5-10-5 shuttle reps", attr: "agi", level: 2, minAge: 10, dose: ["4 reps", "5 reps", "6 reps"], cue: "Plant on your outside foot, touch the line, sink your hips. Rest 60 sec.", needs: "cones" }),
  D({ id: "t-drill", name: "T-drill", attr: "agi", level: 2, minAge: 11, dose: ["3 reps", "4 reps", "5 reps"], cue: "Sprint, shuffle, shuffle, backpedal. Face forward the whole way.", needs: "cones" }),
  D({ id: "3-cone", name: "3-cone (L-drill)", attr: "agi", level: 3, minAge: 12, dose: ["3 reps", "4 reps", "5 reps"], cue: "Tight turns around the cone, lean in, eyes to the next cone.", needs: "cones" }),
  D({ id: "mirror", name: "Mirror drill", attr: "agi", level: 3, minAge: 11, dose: ["4 × 10 sec", "5 × 10 sec", "6 × 10 sec"], cue: "Partner leads, you shadow. React, don't guess.", needs: "partner" }),
  // Explosiveness
  D({ id: "squat-jump", name: "Squat jumps", attr: "exp", level: 1, minAge: 8, dose: ["3 × 5", "3 × 6", "4 × 6"], cue: "Swing your arms, jump tall, land soft and quiet with knees over toes.", jumps: 6 }),
  D({ id: "broad-stick", name: "Broad jump and stick", attr: "exp", level: 1, minAge: 8, dose: ["3 × 3", "4 × 3", "4 × 4"], cue: "Jump forward, freeze the landing for 2 seconds. Quality over distance.", jumps: 4 }),
  D({ id: "pogo", name: "Pogo hops", attr: "exp", level: 1, minAge: 9, dose: ["3 × 10", "3 × 15", "4 × 15"], cue: "Stiff ankles, quick off the ground, like the floor is hot.", jumps: 15 }),
  D({ id: "skater", name: "Skater bounds", attr: "exp", level: 2, minAge: 10, dose: ["3 × 4 each side", "3 × 5 each side", "4 × 5 each side"], cue: "Push sideways off one leg, land on the other, hold 1 second.", jumps: 10 }),
  D({ id: "tuck-jump", name: "Tuck jumps", attr: "exp", level: 2, minAge: 12, dose: ["3 × 4", "3 × 5", "4 × 5"], cue: "Knees to chest, land soft, reset between reps.", jumps: 5 }),
  D({ id: "broad-series", name: "Broad jump series", attr: "exp", level: 3, minAge: 13, dose: ["3 × 3 in a row", "4 × 3 in a row", "5 × 3 in a row"], cue: "Three jumps back to back, no pause. Stick the last one.", jumps: 3 }),
  D({ id: "single-leg-hop", name: "Single-leg hops", attr: "exp", level: 3, minAge: 13, dose: ["2 × 4 each leg", "3 × 4 each leg", "3 × 5 each leg"], cue: "Hop forward and stick it. Knee stays in line with your toes.", jumps: 8 }),
  // Strength (bodyweight only)
  D({ id: "air-squat", name: "Bodyweight squats", attr: "str", level: 1, minAge: 8, dose: ["3 × 12", "3 × 15", "4 × 15"], cue: "Hips back and down, chest up, heels flat." }),
  D({ id: "push-up", name: "Push-ups", attr: "str", level: 1, minAge: 8, dose: ["3 × 8", "3 × 12", "4 × 15"], cue: "Body straight like a board. Chest to a fist-height off the floor. Knees down is fine." }),
  D({ id: "lunge", name: "Reverse lunges", attr: "str", level: 1, minAge: 9, dose: ["3 × 8 each leg", "3 × 10 each leg", "4 × 10 each leg"], cue: "Step back, back knee just above the floor, push through the front heel." }),
  D({ id: "glute-bridge", name: "Single-leg glute bridge", attr: "str", level: 2, minAge: 10, dose: ["3 × 8 each leg", "3 × 10 each leg", "3 × 12 each leg"], cue: "Squeeze at the top for 2 seconds. Hips level." }),
  D({ id: "split-squat", name: "Split squats (slow down)", attr: "str", level: 2, minAge: 11, dose: ["3 × 6 each leg", "3 × 8 each leg", "4 × 8 each leg"], cue: "3 seconds down, drive up. Front knee tracks over your toes." }),
  D({ id: "pike-push", name: "Pike push-ups", attr: "str", level: 3, minAge: 12, dose: ["3 × 6", "3 × 8", "4 × 8"], cue: "Hips high, lower the top of your head toward the floor." }),
  D({ id: "nordic", name: "Assisted Nordic curls", attr: "str", level: 3, minAge: 14, dose: ["2 × 4", "3 × 4", "3 × 5"], cue: "Partner holds your ankles. Lower slowly, catch with your hands.", needs: "partner" }),
  // Core
  D({ id: "plank", name: "Front plank", attr: "core", level: 1, minAge: 8, dose: ["3 × 20 sec", "3 × 30 sec", "3 × 45 sec"], cue: "Squeeze glutes, ribs down, breathe." }),
  D({ id: "side-plank", name: "Side plank", attr: "core", level: 1, minAge: 8, dose: ["2 × 15 sec each side", "3 × 20 sec each side", "3 × 30 sec each side"], cue: "Hips high, straight line head to feet." }),
  D({ id: "dead-bug", name: "Dead bugs", attr: "core", level: 1, minAge: 8, dose: ["3 × 8 each side", "3 × 10 each side", "3 × 12 each side"], cue: "Low back pressed to the floor the whole time." }),
  // Position skills
  D({ id: "ol-stance", name: "Stance and first step", attr: "pos", groups: ["OL", "DL"], level: 1, minAge: 8, dose: ["3 × 6", "4 × 6", "4 × 8"], cue: "Feet under armpits, flat back, eyes up. Fire out on a count and stay low for 2 steps." }),
  D({ id: "ol-punch", name: "Hand punch on a wall", attr: "pos", groups: ["OL", "DL"], level: 1, minAge: 8, dose: ["3 × 8", "3 × 10", "4 × 10"], cue: "Thumbs up, elbows in, strike and lock out. Hands inside.", needs: "wall" }),
  D({ id: "ol-kickslide", name: "Kick-slide", attr: "pos", groups: ["OL"], level: 2, minAge: 11, dose: ["3 × 5 each side", "4 × 5 each side", "4 × 6 each side"], cue: "Kick the back foot, slide the front. Never cross your feet. Stay low." }),
  D({ id: "dl-getoff", name: "Get-off and rip", attr: "pos", groups: ["DL"], level: 2, minAge: 11, dose: ["3 × 5 each side", "4 × 5 each side", "4 × 6 each side"], cue: "Explode on movement, rip the arm through low and tight." }),
  D({ id: "wr-catch", name: "Wall-ball hands", attr: "pos", groups: ["WR", "TE", "RB", "QB", "DB", "ATH"], level: 1, minAge: 8, dose: ["3 × 20 catches", "3 × 25 catches", "4 × 25 catches"], cue: "Diamond hands above the chest, eyes the ball all the way in.", needs: "ball" }),
  D({ id: "wr-release", name: "Release footwork", attr: "pos", groups: ["WR", "TE"], level: 2, minAge: 10, dose: ["3 × 4 each side", "4 × 4 each side", "4 × 5 each side"], cue: "Quick feet, sell one way, burst the other. Hands swipe." }),
  D({ id: "db-pedal", name: "Backpedal and break", attr: "pos", groups: ["DB", "LB"], level: 1, minAge: 9, dose: ["3 × 10 yd", "4 × 10 yd", "4 × 15 yd"], cue: "Low, weight over your toes, arms pump. Plant and drive on the break.", needs: "cones" }),
  D({ id: "lb-fit", name: "Read step and fit", attr: "pos", groups: ["LB"], level: 2, minAge: 11, dose: ["3 × 5", "4 × 5", "4 × 6"], cue: "Short read step, stay square, shuffle and fit with your hips low." }),
  D({ id: "rb-ball", name: "Ball security drill", attr: "pos", groups: ["RB", "QB", "ATH"], level: 1, minAge: 8, dose: ["3 × 20 yd", "4 × 20 yd", "4 × 25 yd"], cue: "Five points of pressure: fingers, palm, forearm, bicep, chest. Switch arms on cuts.", needs: "ball" }),
  D({ id: "qb-drop", name: "Drops and set", attr: "pos", groups: ["QB"], level: 1, minAge: 9, dose: ["3 × 5", "4 × 5", "4 × 6"], cue: "3- and 5-step drops, last step plants and sets. Ball high, eyes downfield." }),
];

export const WARMUP = ["Jog 2 minutes", "Leg swings, 10 each way", "Walking knee hugs, 10 yd", "Skips, 2 × 15 yd", "Lateral shuffle, 2 × 10 yd"];

const TRAINABLE: Attr[] = ["spd", "agi", "exp", "str"];
const label = (a: Attr) => ATTRS.find((x) => x.key === a)!.label;

/** Jump foot-contacts allowed per workout, by age. Conservative for young athletes. */
export const jumpCap = (age: number) => (age <= 10 ? 40 : age <= 13 ? 60 : 80);

export type Focus = { attr: Attr; value: number | null; why: string };
export type Workout = { n: 1 | 2 | 3; title: string; minutes: number; drills: { drill: Drill; dose: string }[]; core: { drill: Drill; dose: string } };
export type Plan = { level: 1 | 2 | 3; focus: Focus[]; workouts: Workout[]; personalized: boolean };

/** The two attributes to train, with a plain-English reason. */
export function pickFocus(rating: Rating, age: number): { focus: Focus[]; personalized: boolean } {
  const group = positionGroup(rating.group);
  const w = WEIGHTS[group] ?? WEIGHTS.ATH;
  const have = TRAINABLE.map((a) => ({ a, v: rating.attrs.find((x) => x.key === a)?.value ?? null }));
  const scored = have.filter((x) => x.v !== null).map((x) => ({ ...x, score: (95 - x.v!) * w[x.a] }));
  scored.sort((x, y) => y.score - x.score);
  if (scored.length >= 2) {
    return {
      personalized: true,
      focus: scored.slice(0, 2).map((x) => ({
        attr: x.a, value: x.v,
        why: x.v! < 70 ? `${label(x.a)} is ${x.v}, under the typical ${age}-year-old (70). Biggest jump on your card.`
          : `${label(x.a)} is ${x.v}. ${w[x.a] >= 2 ? `It's a big part of ${group === "ATH" ? "your" : `${["OL", "LB", "RB"].includes(group) ? "an" : "a"} ${group}'s`} overall, so gains here move the card most.` : "Room to grow here, and it adds to your overall."}`,
      })),
    };
  }
  // Not enough tests yet: train what the position needs most, and add the one test result we have.
  const byPos = [...TRAINABLE].sort((x, y) => w[y] - w[x]);
  const known = scored[0]?.a;
  const picks = known ? [known, ...byPos.filter((a) => a !== known)].slice(0, 2) : byPos.slice(0, 2);
  return {
    personalized: false,
    focus: picks.map((a) => ({ attr: a, value: rating.attrs.find((x) => x.key === a)?.value ?? null, why: `${group === "ATH" ? "Athletes" : `${group}s`} lean on ${label(a).toLowerCase()}. Get tested to make this plan yours.` })),
  };
}

export const baseLevel = (age: number): 1 | 2 | 3 => (age <= 11 ? 1 : 2);
export const levelFor = (age: number, done: number): 1 | 2 | 3 => Math.min(3, baseLevel(age) + Math.floor(done / 6)) as 1 | 2 | 3;

function pick<T>(list: T[], seed: number, k: number): T[] {
  if (!list.length) return [];
  const out: T[] = [];
  for (let i = 0; i < Math.min(k, list.length); i++) out.push(list[(seed + i * 7) % list.length]);
  return [...new Set(out)];
}

/** One week of training. `week` is any number that changes weekly (weeks since epoch); it rotates the drills. */
export function buildPlan(o: { rating: Rating; age: number; done: number; week: number; has?: { cones?: boolean; partner?: boolean; ball?: boolean } }): Plan {
  const { focus, personalized } = pickFocus(o.rating, o.age);
  const level = levelFor(o.age, o.done);
  const group = positionGroup(o.rating.group);
  const ok = (d: Drill) => d.minAge <= o.age && d.level <= level && (!d.needs || d.needs === "wall" || o.has?.[d.needs as "cones" | "partner" | "ball"] !== false);
  const pool = (a: Drill["attr"]) => {
    const all = DRILLS.filter((d) => d.attr === a && ok(d) && (a !== "pos" || d.groups?.includes(group)));
    const top = all.filter((d) => d.level === level); // lean on the current level, keep easier ones in the mix
    return top.length >= 2 ? [...top, ...all.filter((d) => d.level < level).slice(0, 1)] : all;
  };
  const dose = (d: Drill) => d.dose[Math.min(level, d.dose.length) - 1];
  const cap = jumpCap(o.age);
  const sets = (d: { drill: Drill; dose: string }) => (d.drill.jumps ?? 0) * Number(d.dose.match(/^(\d+)/)?.[1] ?? 1);

  const make = (n: 1 | 2 | 3, mix: Attr[]): Workout => {
    const seed = o.week * 3 + n;
    const main: { drill: Drill; dose: string }[] = [];
    mix.forEach((a, i) => pick(pool(a), seed + i, i === 0 ? 2 : 1).forEach((d) => main.push({ drill: d, dose: dose(d) })));
    pick(pool("pos"), seed, 1).forEach((d) => main.push({ drill: d, dose: dose(d) }));
    // Hold jump volume under the age cap by dropping the extra jump drills.
    let total = 0;
    const kept = main.filter((d) => { total += sets(d); return total <= cap || !d.drill.jumps; });
    const core = pick(pool("core"), seed, 1)[0];
    return {
      n, title: n === 3 ? `${label(mix[0])} + ${label(mix[1])}` : `${label(mix[0])} day`,
      minutes: 8 + kept.length * 4 + 3, drills: kept, core: { drill: core, dose: dose(core) },
    };
  };
  const [a, b] = [focus[0].attr, focus[1].attr];
  return { level, focus, personalized, workouts: [make(1, [a, b]), make(2, [b, a]), make(3, [a, b])] };
}
