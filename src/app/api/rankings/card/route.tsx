import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { BANDS, GROUPS } from "@/lib/power";

// The Top 10 card: a 1080×1350 PNG of one board, to save and post. Same privacy as the board:
// only opted-in athletes 13+ are named; everyone else is "Player". Signed-in people only.
const font = (p: string) => readFile(join(process.cwd(), "node_modules/@fontsource", p)).catch(() => null);
const fonts = Promise.all([font("anton/files/anton-latin-400-normal.woff"), font("barlow-condensed/files/barlow-condensed-latin-800-normal.woff")]);

export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return new Response("Not found", { status: 404 });
  const u = new URL(req.url);
  const sport = u.searchParams.get("sport") === "hockey" ? "hockey" : "football";
  const band = (BANDS as readonly string[]).includes(u.searchParams.get("band") ?? "") ? u.searchParams.get("band")! : "HS";
  const group = GROUPS[sport].includes(u.searchParams.get("group") ?? "") ? u.searchParams.get("group")! : GROUPS[sport][0];
  const rows = await asUser(me.id, (q) => q<{ rank: number; ovr: number; display_name: string | null; program: string | null }>(
    "select rank, ovr, display_name, program from power_board($1, $2, $3)", [sport, band, group]));
  if (!rows.length) return new Response("Not enough athletes yet", { status: 404 });
  const [anton, barlow] = await fonts;
  const loaded = [anton && { name: "Anton", data: anton, weight: 400 as const, style: "normal" as const }, barlow && { name: "Barlow Condensed", data: barlow, weight: 800 as const, style: "normal" as const }].filter(Boolean) as { name: string; data: Buffer; weight: 400 | 800; style: "normal" }[];
  const gold = "#f8c40a";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505", fontFamily: "Barlow Condensed" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 960, height: 1260, padding: 48, borderRadius: 36, background: "radial-gradient(circle at 50% 0%, #2a2208, #0a0a0a 60%)", border: `6px solid ${gold}`, color: "#fff" }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 8, color: gold, textTransform: "uppercase" }}>{`ProLyt Power Rankings · ${sport}`}</div>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 150, lineHeight: 1, marginTop: 6 }}>{`TOP ${rows.length}`}</div>
          <div style={{ display: "flex", fontSize: 54, letterSpacing: 6, marginBottom: 22, color: "#cfd3dc" }}>{`${band} · ${group}`}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", height: 84, padding: "0 28px", borderRadius: 18, background: r.rank <= 3 ? "rgba(248,196,10,.16)" : "rgba(255,255,255,.06)", border: r.rank <= 3 ? `2px solid ${gold}` : "2px solid rgba(255,255,255,.08)" }}>
                <div style={{ display: "flex", width: 84, fontFamily: "Anton", fontSize: 52, color: r.rank <= 3 ? gold : "#8b8f9a" }}>{r.rank}</div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 40, textTransform: "uppercase" }}>{r.display_name ?? "Player"}</div>
                  <div style={{ display: "flex", fontSize: 24, color: "#9aa0ad", letterSpacing: 2 }}>{(r.program ?? "ProLyt").toUpperCase()}</div>
                </div>
                <div style={{ display: "flex", fontFamily: "Anton", fontSize: 56 }}>{r.ovr}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", fontSize: 26, letterSpacing: 4, color: "#8b8f9a" }}>
            <div style={{ display: "flex" }}>EARNED, NOT BOUGHT</div>
            <div style={{ display: "flex", color: gold }}>PROLYT.APP</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: loaded, headers: { "Content-Disposition": `attachment; filename="prolyt-top10-${band}-${group}.png"`, "Cache-Control": "private, no-store" } },
  );
}
