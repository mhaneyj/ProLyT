import { describe, expect, it } from "vitest";
import { parseBoothValue } from "../src/lib/booth";

const ok = (m: string, raw: string) => { const r = parseBoothValue(m, raw); return "value" in r ? r.value : r.error; };

describe("booth entry parsing", () => {
  it("reads times, including the fast three-digit form", () => {
    expect(ok("40yd", "5.12")).toBe(5.12);
    expect(ok("40yd", "512")).toBe(5.12);
    expect(ok("10yd", "185")).toBe(1.85);
    expect(ok("three_cone", "845")).toBe(8.45);
    expect(String(ok("three_cone", "8450"))).toMatch(/should be/);
  });
  it("reads broad jump as feet and inches or inches", () => {
    expect(ok("broad", `7'4"`)).toBe(88);
    expect(ok("broad", "7-4")).toBe(88);
    expect(ok("broad", "7 4")).toBe(88);
    expect(ok("broad", "88")).toBe(88);
    expect(String(ok("broad", "7'14"))).toMatch(/0 to 11/);
  });
  it("refuses typos and unknown tests", () => {
    expect(String(ok("40yd", "51"))).toMatch(/should be/);
    expect(String(ok("40yd", "2.1"))).toMatch(/should be/);
    expect(String(ok("40yd", "abc"))).toMatch(/Couldn't read/);
    expect(ok("40yd", "")).toBe("Enter a number");
    expect(ok("bench_reps", "10")).toBe("Unknown test");
  });
  it("rounds to the test's precision", () => {
    expect(ok("vertical", "24.46")).toBe(24.5);
    expect(ok("40yd", "5.126")).toBe(5.13);
  });
});
