import "server-only";
import Stripe from "stripe";

export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Where to send people back to: the address they're on (a program's own domain or prolyt.app), so they stay signed in.
 * NEXT_PUBLIC_SITE_URL is only a fallback when there's no request.
 */
export function siteUrl(requestOrigin?: string | null) {
  return (requestOrigin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
