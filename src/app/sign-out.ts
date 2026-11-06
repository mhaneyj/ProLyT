"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, SECURE_SESSION_COOKIE, DEV_SESSION_COOKIE } from "@/lib/auth";
import { asService, isDemo } from "@/lib/db";
import { endSession } from "@/lib/session";

export async function signOut() {
  const jar = await cookies();
  if (isDemo) jar.delete(DEMO_COOKIE);
  else {
    for (const name of [SECURE_SESSION_COOKIE, DEV_SESSION_COOKIE]) {
      const token = jar.get(name)?.value;
      if (token) await asService((q) => endSession(q, token));
      jar.delete(name);
    }
  }
  redirect("/");
}
