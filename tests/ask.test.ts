import { describe, it, expect, vi } from "vitest";
import { GUIDE, forRole, findTopics, guideText } from "../src/lib/guide";
import { ask, guideAnswer } from "../src/lib/ask";
import { readdirSync } from "node:fs";

const routeExists = (href: string) => {
  const path = href.split("?")[0];
  if (path === "/") return true;
  const find = (dir: string, segs: string[]): boolean => {
    if (!segs.length) return readdirSync(dir).some((f) => /^page\.tsx?$/.test(f));
    const [s, ...rest] = segs;
    const subs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    return subs.some((d) => (d.name === s || (d.name.startsWith("(") && false)) && find(`${dir}/${d.name}`, rest)) ||
      subs.some((d) => d.name.startsWith("(") && find(`${dir}/${d.name}`, segs)) ||
      subs.some((d) => /^\[.+\]$/.test(d.name) && find(`${dir}/${d.name}`, rest));
  };
  return find("src/app", path.split("/").filter(Boolean));
};

describe("guide", () => {
  it("has unique ids and every role has topics", () => {
    expect(new Set(GUIDE.map((t) => t.id)).size).toBe(GUIDE.length);
    for (const r of ["family", "coach", "owner"] as const) expect(forRole(r).length).toBeGreaterThan(5);
  });
  it("every link points at a real page", () => {
    for (const t of GUIDE) if (t.href) expect(routeExists(t.href), `${t.id} -> ${t.href}`).toBe(true);
  });
  it("finds the right topic by keyword", () => {
    expect(findTopics("how do I get on the waitlist", "family")[0]?.id).toBe("waitlist");
    expect(findTopics("how do i get paid", "coach").length).toBeGreaterThan(0);
    expect(findTopics("zzzz qqqq", "family")).toEqual([]);
  });
  it("coach-only topics stay out of the family guide", () => {
    expect(guideText("family")).not.toMatch(/Start Testing Day/);
  });
});

describe("ask", () => {
  it("works with no key by answering from the guide", async () => {
    const a = await ask("how do I join a waitlist", "family", [], vi.fn() as never, "");
    expect(a.source).toBe("guide");
    expect(a.answer.length).toBeGreaterThan(20);
  });
  it("says it doesn't know instead of guessing", () => {
    expect(guideAnswer("qqqq zzzz", "family").answer).toMatch(/Help & feedback/);
  });
  it("calls the API with a guide-only prompt and caps history", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: "text", text: "Open Schedule and tap Book." }] }) });
    const hist = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const a = await ask("how do I book", "family", hist, f as never, "k");
    expect(a).toMatchObject({ source: "bot", answer: "Open Schedule and tap Book." });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.system).toMatch(/ONLY from the GUIDE/);
    expect(body.messages).toHaveLength(5);
    expect(f.mock.calls[0][1].headers["x-api-key"]).toBe("k");
  });
  it("falls back to the guide when the API fails", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const a = await ask("how do I book a session", "family", [], f as never, "k");
    expect(a.source).toBe("guide");
  });
});
