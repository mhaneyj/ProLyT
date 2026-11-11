import "server-only";
export { SPECIALTIES, KIND_LABEL } from "./domain/trainers";

/**
 * Independent trainers (selling their own services, paid to their own Stripe) are off for launch:
 * coaches sell 1-on-1s through their program, and ProLyt takes no extra cut of a program's own sessions.
 * Set INDEPENDENT_TRAINERS=1 to turn the marketplace on.
 */
export const MARKETPLACE = process.env.INDEPENDENT_TRAINERS === "1";

/** ProLyt's cut of online trainer payments, in basis points (10% default). */
export const TRAINER_FEE_BPS = Math.max(0, Math.min(3000, Number(process.env.TRAINER_FEE_BPS ?? 1000)));

export type TrainerProfile = { user_id: string; slug: string; display_name: string; headline: string | null; bio: string | null; city: string | null;
  specialties: string[]; org_id: string | null; listed: boolean; verified_at: string | null; payouts_enabled: boolean; has_photo: boolean; program: string | null };

export const PROFILE_COLS = `t.user_id, t.slug, t.display_name, t.headline, t.bio, t.city, t.specialties, t.org_id, t.listed, t.verified_at, t.payouts_enabled,
  trainer_has_photo(t.user_id) has_photo, o.name program`;
