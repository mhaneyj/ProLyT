import "server-only";
export { SPECIALTIES, KIND_LABEL } from "./domain/trainers";

/** ProLyt's cut of online trainer payments, in basis points (10% default). */
export const TRAINER_FEE_BPS = Math.max(0, Math.min(3000, Number(process.env.TRAINER_FEE_BPS ?? 1000)));

export type TrainerProfile = { user_id: string; slug: string; display_name: string; headline: string | null; bio: string | null; city: string | null;
  specialties: string[]; org_id: string | null; listed: boolean; verified_at: string | null; payouts_enabled: boolean; has_photo: boolean; program: string | null };

export const PROFILE_COLS = `t.user_id, t.slug, t.display_name, t.headline, t.bio, t.city, t.specialties, t.org_id, t.listed, t.verified_at, t.payouts_enabled,
  trainer_has_photo(t.user_id) has_photo, o.name program`;
