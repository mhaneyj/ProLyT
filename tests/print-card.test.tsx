import { describe, expect, it } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { backCells, backItems, FRAME_FOR_TIER, FRAMES, fitSize, frontItems, printValue, testedLine, type Item, type PrintInput } from "../src/lib/print-card";
import { renderPrintCard } from "../src/lib/print-card-render";

const base: PrintInput = {
  tier: "player", first: "Jaxon", last: "Reed", position: "QB", sport: "football", ovr: 78,
  marks: { "40yd": 5.12, "10yd": 1.85, pro_agility: 4.71, vertical: 24, broad: 88 },
  band: "12U", cardNo: "412", event: null, org: "Game-Fit Loomis",
  highlight: "#1 of 40 in 12U 40-yard dash at Game-Fit Loomis",
  attrs: [{ short: "SPD", value: 81 }, { short: "AGI", value: 76 }, { short: "EXP", value: 70 }, { short: "STR", value: null }, { short: "TEC", value: 74 }, { short: "IQ", value: 80 }],
  career: [["Sessions", 14], ["PRs", 5], ["Events", 2], ["Challenges", 3]],
};
const texts = (xs: Item[]) => xs.flatMap((x) => (x.kind === "text" ? [x.text] : []));

describe("print card layout", () => {
  it("formats marks the way the card back does", () => {
    expect(printValue("40yd", 5.1)).toBe("5.10");
    expect(printValue("broad", 88)).toBe(`7'4"`);
    expect(printValue("vertical", 24)).toBe(`24"`);
  });

  it("shows a dash for tests the athlete has not done", () => {
    const cells = backCells(base);
    expect(cells.map((c) => c.value)).toEqual(["5.12", "1.85", "4.71", null, `24"`, `7'4"`]);
    expect(cells).toHaveLength(6);
  });

  it("every tier has frame art, every box is inside the card, and six test cells", () => {
    for (const tier of Object.keys(FRAME_FOR_TIER) as (keyof typeof FRAME_FOR_TIER)[]) {
      const f = FRAMES[FRAME_FOR_TIER[tier]];
      expect(f.back.cells).toHaveLength(6);
      const boxes = [f.front.window, f.front.plate, f.front.banner, f.back.plate, f.back.big, f.back.tested, f.back.square, f.back.footer, ...f.back.cells];
      for (const b of boxes) { expect(b[0]).toBeGreaterThanOrEqual(0); expect(b[2]).toBeLessThanOrEqual(1060); expect(b[1]).toBeGreaterThanOrEqual(0); expect(b[3]).toBeLessThanOrEqual(1484); }
    }
  });

  it("keeps long names inside the plate", () => {
    const long = { ...base, first: "Maximilian-Alexander", last: "Featherstonehaugh" };
    const name = frontItems(long)[0];
    expect(name.kind).toBe("text");
    if (name.kind === "text") expect(name.text.length * name.size * 0.5).toBeLessThanOrEqual(name.w + 1);
    expect(fitSize("A", 900, 80)).toBe(80);
  });

  it("never prints age, weight, hometown, school, team or a QR code", () => {
    for (const tier of Object.keys(FRAME_FOR_TIER) as (keyof typeof FRAME_FOR_TIER)[]) {
      const all = texts([...frontItems({ ...base, tier }), ...backItems({ ...base, tier })]).join(" | ").toUpperCase();
      for (const bad of ["AGE", "WEIGHT", "LBS", "HOMETOWN", "SCHOOL", "TEAM", "QR", "SCAN"]) expect(all).not.toContain(bad);
    }
  });

  it("falls back to career counts when attributes are locked, and to a dash when there is no overall", () => {
    const locked = texts(backItems({ ...base, attrs: null, ovr: null }));
    expect(locked).toContain("SESSIONS");
    expect(locked).toContain("--");
    expect(locked).toContain("NEEDS 3 TESTS");
    expect(texts(backItems(base))).toContain("SPD");
    expect(texts(backItems(base))).not.toContain("STR");
  });

  it("names the event on event cards and the program otherwise", () => {
    expect(testedLine({ ...base, event: { name: "Loomis 7v7 Showdown", date: "Oct 2026" } })).toBe("TESTED AT LOOMIS 7V7 SHOWDOWN · OCT 2026");
    expect(testedLine(base)).toBe("TESTED AT GAME-FIT LOOMIS");
    expect(testedLine({ ...base, org: null })).toBe("VERIFIED PERFORMANCE · PROLYT");
    expect(texts(frontItems({ ...base, tier: "attendee", event: { name: "Loomis 7v7 Showdown", date: "Oct 2026" } }))).toContain("LOOMIS 7V7 SHOWDOWN");
  });
});

// Set PROOF_DIR to write a front and back for every tier, to look at. Skipped otherwise.
describe.skipIf(!process.env.PROOF_DIR)("print card render proofs", () => {
  it("renders every tier, with and without a photo", async () => {
    const dir = process.env.PROOF_DIR as string;
    await mkdir(dir, { recursive: true });
    const photo = await readFile(process.env.PROOF_PHOTO as string);
    for (const tier of Object.keys(FRAME_FOR_TIER) as (keyof typeof FRAME_FOR_TIER)[]) {
      const input: PrintInput = { ...base, tier, event: tier === "player" || tier === "signed" ? null : { name: "Loomis 7v7 Showdown", date: "Oct 2026" } };
      for (const side of ["front", "back"] as const) {
        const res = await renderPrintCard(input, side, photo);
        const buf = Buffer.from(await res.arrayBuffer());
        expect(buf.subarray(1, 4).toString()).toBe("PNG");
        await writeFile(join(dir, `${tier}-${side}.png`), buf);
      }
    }
    const res = await renderPrintCard({ ...base, last: "Reed-Longname", attrs: null, marks: {}, highlight: null }, "front", null);
    await writeFile(join(dir, "nophoto-front.png"), Buffer.from(await res.arrayBuffer()));
    const res2 = await renderPrintCard({ ...base, attrs: null, marks: {}, highlight: null }, "back", null);
    await writeFile(join(dir, "empty-back.png"), Buffer.from(await res2.arrayBuffer()));
  }, 120000);
});
