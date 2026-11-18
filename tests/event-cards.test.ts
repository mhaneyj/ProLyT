import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const PARENT = "10000000-0000-0000-0000-000000000051", OTHER = "10000000-0000-0000-0000-000000000052", HOST = "10000000-0000-0000-0000-000000000053", COACH = "10000000-0000-0000-0000-000000000054";
let db: PGlite, ev: string, kid: string, order: string;

beforeAll(async () => {
  db = await makeDb();
  for (const u of [PARENT, OTHER, HOST, COACH]) await addUser(db, u);
  await db.query("insert into org_members (org_id, user_id, role) values ($1,$2,'owner')", [ORG, HOST]);
  ev = (await db.query<{ id: string }>("insert into events (org_id, name, starts_on, status) values ($1,'Loomis Combine',current_date + 7,'open') returning id", [ORG])).rows[0].id;
  const div = (await db.query<{ id: string }>("insert into divisions (event_id, name, max_age, age_cutoff) values ($1,'12U',12,'2026-08-01') returning id", [ev])).rows[0].id;
  const team = (await db.query<{ id: string }>("insert into event_teams (event_id, division_id, name, coach_id) values ($1,$2,'Loomis Lions',$3) returning id", [ev, div, COACH])).rows[0].id;
  kid = (await db.query<{ id: string }>("insert into athletes (first_name,last_name,birth_date,position) values ('Card','Kid','2014-03-01','QB') returning id")).rows[0].id;
  await db.query("insert into guardians (athlete_id, user_id, is_primary) values ($1,$2,true)", [kid, PARENT]);
  await db.query("insert into event_roster (team_id, athlete_id, event_id) values ($1,$2,$3)", [team, kid, ev]);
});

describe("event collector cards", () => {
  it("only the family of a rostered athlete can order", async () => {
    await expect(as(db, OTHER, () => db.query("select * from start_event_card_order($1,$2)", [ev, kid]))).rejects.toThrow(/parent or guardian/);
    const r = await as(db, PARENT, () => db.query<{ order_id: string; price_cents: number; organizer_cents: number }>("select * from start_event_card_order($1,$2)", [ev, kid]));
    order = r.rows[0].order_id;
    expect(r.rows[0].price_cents).toBe(2500);
    expect(r.rows[0].organizer_cents).toBe(500);
  });
  it("resuming an unpaid order reuses it; a paid one cannot be ordered twice", async () => {
    const again = await as(db, PARENT, () => db.query<{ order_id: string }>("select * from start_event_card_order($1,$2)", [ev, kid]));
    expect(again.rows[0].order_id).toBe(order);
    await db.query("select complete_event_card_order($1,'cs_test_1',true)", [order]);
    await expect(as(db, PARENT, () => db.query("select * from start_event_card_order($1,$2)", [ev, kid]))).rejects.toThrow(/already ordered/);
    expect((await db.query<{ ok: boolean }>("select complete_event_card_order($1,'cs_test_1',true) ok", [order])).rows[0].ok).toBe(false);
  });
  it("is not an open door: payment can't be completed by users", async () => {
    await expect(as(db, PARENT, () => db.query("select complete_event_card_order($1,'x',false)", [order]))).rejects.toThrow();
  });
  it("staff see the queue and may print; others may not", async () => {
    const q = await as(db, HOST, () => db.query<{ athlete: string; status: string; pos: string }>("select * from event_card_queue($1)", [ev]));
    expect(q.rows.length).toBe(1);
    expect(q.rows[0]).toMatchObject({ athlete: "Card Kid", status: "paid", pos: "QB" });
    expect((await as(db, HOST, () => db.query<{ ok: boolean }>("select can_print_event_card($1,$2) ok", [ev, kid]))).rows[0].ok).toBe(true);
    expect((await as(db, OTHER, () => db.query<{ ok: boolean }>("select can_print_event_card($1,$2) ok", [ev, kid]))).rows[0].ok).toBe(false);
    expect((await as(db, PARENT, () => db.query<{ ok: boolean }>("select can_print_event_card($1,$2) ok", [ev, kid]))).rows[0].ok).toBe(false);
    await expect(as(db, OTHER, () => db.query("select * from event_card_queue($1)", [ev]))).rejects.toThrow(/Staff only/);
  });
  it("printed, picked up, and the host's $5 per card", async () => {
    await as(db, HOST, () => db.query("select mark_event_card($1,'printed')", [order]));
    await as(db, HOST, () => db.query("select mark_event_card($1,'picked_up')", [order]));
    const s = (await as(db, HOST, () => db.query<{ ordered: number; picked_up: number; organizer_cents: number }>("select * from event_card_summary($1)", [ev]))).rows[0];
    expect(s).toMatchObject({ ordered: 1, picked_up: 1, organizer_cents: 500 });
    await expect(as(db, OTHER, () => db.query("select mark_event_card($1,'printed')", [order]))).rejects.toThrow(/Staff only/);
    expect((await as(db, PARENT, () => db.query<{ status: string }>("select * from my_event_cards($1)", [ev]))).rows[0].status).toBe("picked_up");
  });
});
