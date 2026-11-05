"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { TZ } from "@/lib/domain/format";
import { PROGRAMS } from "@/lib/domain/programs";

export type NewSessionState = { error?: string; values?: Record<string, string> };

const schema = z.object({
  program: z.string().refine((p) => p in PROGRAMS, "Pick a program"),
  title: z.string().trim().min(2, "Give the session a name").max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  minutes: z.coerce.number().int().min(15).max(600),
  location: z.string().trim().max(120).optional(),
  coach: z.union([z.guid(), z.literal("")]).optional(),
  capacity: z.union([z.coerce.number().int().min(1, "Spots must be at least 1").max(500), z.literal("")]).optional(),
  price: z.union([z.coerce.number().min(0).max(5000), z.literal("")]).optional(),
  weeks: z.coerce.number().int().min(1).max(26),
});

export async function createSession(_: NewSessionState, form: FormData): Promise<NewSessionState> {
  const me = await requireRole("coach", "owner");
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message, values };
  const d = p.data;
  const coach = d.coach || me.id;
  try {
    await asUser(me.id, (q) =>
      q(
        `select create_sessions($1, $2::session_kind, $3, $4, ($5::timestamp at time zone '${TZ}'), $6, $7, $8, $9, $10, $11)`,
        [me.orgId, PROGRAMS[d.program].kind, d.program, d.title, `${d.date} ${d.time}`, d.minutes, d.location ?? null,
          coach, d.capacity === "" || d.capacity === undefined ? null : d.capacity,
          d.price === "" || d.price === undefined ? null : Math.round(Number(d.price) * 100), d.weeks],
      ),
    );
  } catch (e) {
    return { error: dbMessage(e), values };
  }
  revalidatePath("/coach");
  revalidatePath("/schedule");
  redirect(`/coach?posted=${d.weeks}`);
}

