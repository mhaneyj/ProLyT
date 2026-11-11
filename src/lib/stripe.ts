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

/**
 * The address the person is actually on (a program's own domain, its prolyt.app subdomain, or prolyt.app), from the
 * request's Host header. request.nextUrl.origin can drop the subdomain or custom domain, which signs people out
 * (cookies are per address) and breaks payments.
 */
export function requestBase(request: Request) {
  const h = request.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host)) return siteUrl();
  const local = host.startsWith("localhost") || host.includes(".localhost") || host.startsWith("127.");
  const proto = (h.get("x-forwarded-proto") ?? (local ? "http" : "https")).split(",")[0].trim();
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

/**
 * Runs a payment route. If Stripe (or anything else) fails, the person goes back to the page they came from with a
 * plain message, instead of a blank error response (which phones save as a "download").
 */
export function payRoute<T extends unknown[]>(handler: (request: import("next/server").NextRequest, ...rest: T) => Promise<Response>, backTo?: string) {
  return async (request: import("next/server").NextRequest, ...rest: T): Promise<Response> => {
    try {
      return await handler(request, ...rest);
    } catch (e) {
      // Next's redirect()/notFound() throw on purpose; let them through.
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
      const err = e as { type?: string; message?: string; code?: string };
      console.error("[pay]", request.nextUrl.pathname, err?.type, err?.code, err?.message);
      const origin = requestBase(request);
      const ref = request.headers.get("referer");
      let back = `${origin}/home`;
      if (backTo) back = `${origin}${backTo}`;
      else try { if (ref && new URL(ref).origin === origin) { const u = new URL(ref); u.searchParams.delete("error"); back = u.toString(); } } catch {}
      const why = err?.type === "StripeAuthenticationError" ? "Payments aren't set up correctly yet (ProLyt is fixing it)."
        : err?.type === "StripeConnectionError" ? "We couldn't reach the payment processor. Try again in a minute."
        : err?.type?.startsWith("Stripe") ? `The payment processor said: ${err.message ?? "something went wrong"}`
        : "Something went wrong starting the payment. Try again, or ask your coach.";
      const u = new URL(back);
      u.searchParams.set("error", `Payment didn't start. ${why}`);
      return Response.redirect(u.toString(), 303);
    }
  };
}
