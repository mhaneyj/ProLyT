import "server-only";
import { asService } from "./db";
import { readAthletePhoto } from "./photo-data";
import { isHockey, positionGroup } from "./domain/rating";

const POSE: Record<string, string> = {
  QB: "setting to throw a football", RB: "running with the football, cutting upfield", WR: "making a leaping catch", TE: "catching a pass over the middle",
  OL: "in a low three-point blocking stance", DL: "exploding off the line in a pass rush", LB: "closing in for a tackle", DB: "back-pedaling in coverage",
  ATH: "sprinting with the football", F: "skating hard with a hockey stick, puck on the blade", D: "skating backward with a hockey stick, defending", G: "set in the crease in goalie gear",
};

/** The instruction for the model. It keeps the face, and bans anything that would tie the card to a school or team (CIF rules) or add text. */
export function actionPrompt(position: string | null, sport: string | null) {
  const pose = POSE[positionGroup(position, sport)] ?? POSE.ATH;
  const game = isHockey(sport) ? "ice hockey" : "football";
  return `Photorealistic sports trading card action photo of this same young ${game} player, ${pose}. Keep the person's face, hair, skin tone and build exactly the same. `
    + `Stadium lights at night, dramatic rim lighting, shallow depth of field. Plain generic uniform in solid colors. No logos, no text, no numbers, no school or team names, no brand marks.`;
}

type Result = { ok: true; image: Buffer; mime: string } | { ok: false; note: string };

/** Calls fal.ai FLUX Kontext [pro] with the athlete's photo. Without FAL_KEY it returns the original photo so the flow can be tested. */
export async function generate(photo: { buf: Buffer; mime: string }, prompt: string, fetcher: typeof fetch = fetch, key = process.env.FAL_KEY): Promise<Result> {
  if (!key) return { ok: true, image: photo.buf, mime: photo.mime };
  const res = await fetcher("https://fal.run/fal-ai/flux-pro/kontext", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_url: `data:${photo.mime};base64,${photo.buf.toString("base64")}`, output_format: "jpeg", aspect_ratio: "3:4", num_images: 1, safety_tolerance: "2" }),
  });
  if (!res.ok) return { ok: false, note: `The AI service said no (${res.status}).` };
  const j = (await res.json()) as { images?: { url: string }[]; has_nsfw_concepts?: boolean[] };
  if (j.has_nsfw_concepts?.[0]) return { ok: false, note: "The image was blocked by the safety check." };
  const url = j.images?.[0]?.url;
  if (!url) return { ok: false, note: "No image came back." };
  const img = await fetcher(url);
  if (!img.ok) return { ok: false, note: "Couldn't download the image." };
  return { ok: true, image: Buffer.from(await img.arrayBuffer()), mime: img.headers.get("content-type") ?? "image/jpeg" };
}

/** Runs one started shot to the end and saves the result as a draft for the parent to review. */
export async function makeShot(shotId: string, athleteId: string) {
  try {
    const photo = await readAthletePhoto(athleteId);
    if (!photo) throw new Error("no photo");
    const [a] = await asService((q) => q<{ position: string | null; sport: string | null }>("select position, sport from athletes where id = $1", [athleteId]));
    const r = await generate(photo, actionPrompt(a?.position ?? null, a?.sport ?? null));
    await asService((q) => q("select finish_ai_photo($1, $2, $3, $4, $5)", [shotId, r.ok ? r.image : null, r.ok ? r.mime : null, r.ok, r.ok ? null : r.note]));
  } catch (e) {
    console.error("[ai-photo] failed:", e instanceof Error ? e.message : e);
    await asService((q) => q("select finish_ai_photo($1, null, null, false, $2)", [shotId, "Something went wrong. Try again."])).catch(() => {});
  }
}
