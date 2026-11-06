import { ImageResponse } from "next/og";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatValue, metricLabel } from "@/lib/domain/metrics";

// A ready-to-post graphic for Instagram/TikTok Stories (1080×1920): new PRs, highlights, or a post's words.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [p] = await asUser(me.id, (q) => q<{ kind: string; body: string | null; metric: string | null; value: number | null; name: string | null;
    line: string | null; color: string | null; org: string | null; program: string | null }>(`
    select p.kind, p.body, p.metric, p.value::float value, a.first_name || ' ' || a.last_name name,
      concat_ws(' · ', a.position, case when a.grad_year is not null then 'Class of ' || a.grad_year end) line,
      a.theme_color color, o.name org,
      (select string_agg(o2.name, ' · ') from program_athletes pa join orgs o2 on o2.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active') program
    from posts p left join athletes a on a.id = p.athlete_id left join orgs o on o.id = p.org_id where p.id = $1`, [id]));
  if (!p) return new Response("Not found", { status: 404 });
  const color = p.color && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#F8C40A";
  const who = p.name ?? p.org ?? "ProLyt";
  const headline = p.kind === "pr" ? "NEW PERSONAL RECORD" : p.kind === "highlight" ? "NEW HIGHLIGHT" : p.kind === "joined" ? "NEW TEAM" : who.toUpperCase();
  const big = p.kind === "pr" && p.metric && p.value != null ? formatValue(p.metric, Number(p.value)) : null;
  const sub = p.kind === "pr" && p.metric ? metricLabel(p.metric) : p.kind === "joined" ? `Joined ${p.body ?? ""}` : (p.body ?? "").slice(0, 220);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 96,
        background: `linear-gradient(165deg, ${color} 0%, #0b0b0b 62%)`, color: "#f2efe6", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 44, letterSpacing: 10, fontWeight: 800, opacity: 0.9 }}>{p.program ?? p.org ?? "PROLYT"}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 54, letterSpacing: 8, fontWeight: 800, color: "#ffffff" }}>{headline}</div>
          {big ? <div style={{ display: "flex", fontSize: 340, fontWeight: 900, lineHeight: 1, marginTop: 24 }}>{big}</div> : null}
          <div style={{ display: "flex", fontSize: big ? 72 : 76, fontWeight: 700, marginTop: 24, lineHeight: 1.2 }}>{sub}</div>
          {p.kind === "pr" ? <div style={{ display: "flex", fontSize: 40, marginTop: 20, color: "#6fdc8c", letterSpacing: 4 }}>COACH-VERIFIED</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 900 }}>{who}</div>
          {p.line ? <div style={{ display: "flex", fontSize: 44, opacity: 0.8, marginTop: 8 }}>{p.line}</div> : null}
          <div style={{ display: "flex", fontSize: 36, opacity: 0.6, marginTop: 48, letterSpacing: 6 }}>PROLYT.APP</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "cache-control": "private, max-age=300" } },
  );
}
