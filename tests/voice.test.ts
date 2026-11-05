import { describe, it, expect } from "vitest";
import { parseSpoken, readValue } from "../src/lib/domain/voice";

const roster = [
  { id: "j", first: "Jordan", last: "Morgan" },
  { id: "t", first: "Ty", last: "Reed" },
  { id: "s", first: "Sam", last: "King" },
  { id: "e1", first: "Eli", last: "Park" },
  { id: "e2", first: "Eli", last: "West" },
];

describe("reading spoken numbers", () => {
  it("handles the ways coaches say a 40 time", () => {
    const v = (t: string) => readValue("40yd", t.split(" ")).value;
    expect(v("5 2 1")).toBe(5.21);
    expect(v("5 21")).toBe(5.21);
    expect(v("5.21")).toBe(5.21);
    expect(v("521")).toBe(5.21);
    expect(v("40 5 2 1")).toBe(5.21);
    expect(v("5 . 2 1")).toBe(5.21);
  });
});

describe("parsing a spoken session log", () => {
  it("reads names, times and notes like the prototype example", () => {
    const { items } = parseSpoken(
      "Jordan forty five two one, Ty five oh four, Sam five three eight. Jordan, hands inside on pass sets, next focus staying low on the second step.",
      roster, "40yd");
    expect(items.map((i) => [i.athleteId, i.value])).toEqual([["j", 5.21], ["t", 5.04], ["s", 5.38]]);
    expect(items[0].note).toBe("Hands inside on pass sets");
    expect(items[0].focus).toBe("staying low on the second step");
  });
  it("needs a last name or initial when two kids share a first name", () => {
    const { items } = parseSpoken("Eli west twenty four and a half, Eli P 22", roster, "vertical");
    expect(items.map((i) => [i.athleteId, i.value])).toEqual([["e2", 24.5], ["e1", 22]]);
    expect(parseSpoken("Eli 22", roster, "vertical").items).toHaveLength(0);
  });
  it("reads pounds and digits from speech-to-text", () => {
    expect(parseSpoken("Sam three hundred fifteen. Ty 280", roster, "sled_lb").items.map((i) => i.value)).toEqual([315, 280]);
    expect(parseSpoken("Jordan 5.21. Ty 5.04.", roster, "40yd").items.map((i) => i.value)).toEqual([5.21, 5.04]);
  });
  it("keeps a name with no number as a note-only line", () => {
    const { items } = parseSpoken("Ty great effort today next focus first step", roster, "40yd");
    expect(items[0]).toMatchObject({ value: null, note: "Great effort today", focus: "first step" });
  });
});
