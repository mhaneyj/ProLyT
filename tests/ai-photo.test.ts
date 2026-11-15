import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/db", () => ({ asService: vi.fn() }));
vi.mock("../src/lib/photo-data", () => ({ readAthletePhoto: vi.fn() }));
const { actionPrompt, generate } = await import("../src/lib/ai-photo");

const photo = { buf: Buffer.from("orig"), mime: "image/jpeg" };
const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body, arrayBuffer: async () => new TextEncoder().encode("img").buffer, headers: new Headers({ "content-type": "image/jpeg" }) }) as unknown as Response;

describe("action shot", () => {
  it("prompt keeps the face, bans logos and school names, and fits the position", () => {
    const p = actionPrompt("OL", "football");
    expect(p).toMatch(/three-point/);
    expect(p).toMatch(/exactly the same/);
    expect(p).toMatch(/No logos, no text, no numbers, no school or team names/);
    expect(actionPrompt("Goalie", "hockey")).toMatch(/goalie gear/);
    expect(actionPrompt(null, "football")).toMatch(/sprinting/);
  });
  it("without a key it hands back the original photo (test mode)", async () => {
    const r = await generate(photo, "x", vi.fn() as unknown as typeof fetch, "");
    expect(r).toEqual({ ok: true, image: photo.buf, mime: "image/jpeg" });
  });
  it("sends the photo to fal with the key, and refuses blocked or failed results", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ images: [{ url: "https://x/y.jpg" }], has_nsfw_concepts: [false] })).mockResolvedValueOnce(json({}));
    const r = await generate(photo, "go", f as unknown as typeof fetch, "k");
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://fal.run/fal-ai/flux-pro/kontext");
    expect(init.headers.Authorization).toBe("Key k");
    expect(JSON.parse(init.body).image_url).toMatch(/^data:image\/jpeg;base64,/);
    const blocked = await generate(photo, "go", vi.fn().mockResolvedValue(json({ images: [{ url: "u" }], has_nsfw_concepts: [true] })) as unknown as typeof fetch, "k");
    expect(blocked).toMatchObject({ ok: false });
    const down = await generate(photo, "go", vi.fn().mockResolvedValue(json({}, false, 500)) as unknown as typeof fetch, "k");
    expect(down).toMatchObject({ ok: false });
  });
});
