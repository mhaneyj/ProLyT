import "server-only";
import Stripe from "stripe";

export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function siteUrl(fallback?: string | null) {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? fallback ?? "http://localhost:3000").replace(/\/$/, "");
}
