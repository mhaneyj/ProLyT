import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { myThreads, threadLabel } from "@/lib/messages";
import { ago } from "@/lib/domain/format";
import { Empty, LinkButton, Title } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "./live";

export const metadata = { title: "Messages" };

export default async function Inbox() {
  const me = await requireMe();
  if (!me.features.messaging) redirect(homeFor(me));
  const staff = me.roles.includes("coach") || me.roles.includes("owner");
  const threads = await myThreads(me.id);
  const multi = new Set(threads.map((t) => t.org_id)).size > 1;
  return (
    <>
      <LiveRefresh every={15000} />
      <Title sub={staff ? "Announcements, team chats and family conversations" : "From your coaches and teams"}>Messages</Title>
      {staff ? <LinkButton href="/messages/new">New message</LinkButton> : null}
      {threads.length === 0 ? (
        <Empty title="No messages yet">{staff ? "Post an announcement or message a team." : "When a coach posts, it shows up here."}</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/messages/${t.id}`} className={`flex items-center gap-3 rounded-xl border p-3.5 hover:border-gold ${t.unread ? "border-gold/60 bg-gold/5" : "border-line bg-panel"}`}>
                <span className={`flex size-11 flex-none items-center justify-center rounded-full ${t.kind === "announcements" ? "bg-gold text-on-gold" : "bg-[#1c1c1c] text-gold"}`}>
                  <Icon name={t.kind === "announcements" ? "star" : t.kind === "team" ? "dashboard" : "chat"} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${t.unread ? "font-bold" : "font-semibold"}`}>{threadLabel(t)}</span>
                    {t.last_message_at ? <span className="flex-none text-[11px] text-muted">{ago(t.last_message_at)}</span> : null}
                  </span>
                  <span className="block truncate text-[13px] text-muted">{multi ? `${t.org_name} · ` : ""}{t.preview ?? "No messages yet"}</span>
                </span>
                {t.unread ? <span aria-label="Unread" className="size-2.5 flex-none rounded-full bg-gold" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-[12px] leading-relaxed text-muted">
        Messages with athletes under 18 always include their parents. Coaches can&apos;t message a minor privately.
      </p>
    </>
  );
}
