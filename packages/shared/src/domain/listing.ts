/** Объявления: статусы, срок жизни, частичная продажа партии. */
export type ListingKind = "livestock" | "meat" | "service" | "wanted";
export type ListingStatus = "draft" | "pending_moderation" | "active" | "rejected" | "reserved" | "sold" | "expired" | "archived" | "hidden_quarantine";
export type PriceType = "per_head" | "per_kg_live" | "per_kg_meat" | "per_lot" | "negotiable";
export type Purpose = "slaughter" | "fattening" | "breeding" | "kurban" | "dairy" | "sogym";

export const LISTING_TTL_DAYS = 30;
export const MIN_PHOTOS = 3;

export function listingExpiresAt(publishedAt: Date, ttlDays = LISTING_TTL_DAYS): Date {
  return new Date(publishedAt.getTime() + ttlDays * 86_400_000);
}

export function isExpired(expiresAt: Date | null, now = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

export class ListingError extends Error { constructor(public code: string, m: string) { super(m); } }

/** Продажа части партии: уменьшаем количество, при нуле → sold. */
export function sellPartial(listing: { status: ListingStatus; quantity: number }, soldQty: number) {
  if (listing.status !== "active" && listing.status !== "reserved") throw new ListingError("not_active", "Объявление неактивно");
  if (soldQty <= 0) throw new ListingError("bad_qty", "Количество должно быть положительным");
  if (soldQty > listing.quantity) throw new ListingError("too_many", "Продано больше, чем есть в партии");
  listing.quantity -= soldQty;
  if (listing.quantity === 0) listing.status = "sold";
  return listing;
}

/** Переходы статусов объявления, доступные владельцу. */
const OWNER_TRANSITIONS: Partial<Record<ListingStatus, ListingStatus[]>> = {
  draft: ["pending_moderation", "active", "archived"],
  pending_moderation: ["archived"],
  active: ["reserved", "sold", "archived"],
  reserved: ["active", "sold", "archived"],
  sold: ["archived", "active"],
  expired: ["active", "archived"],
  rejected: ["draft", "archived"],
  archived: ["draft"],
  hidden_quarantine: ["archived"],
};

export function ownerCanSet(from: ListingStatus, to: ListingStatus): boolean {
  return (OWNER_TRANSITIONS[from] ?? []).includes(to);
}

/** Публикация: премодерация или сразу active. */
export function publishTarget(premoderate: boolean): ListingStatus {
  return premoderate ? "pending_moderation" : "active";
}

/** Валидация полноты объявления о скоте перед публикацией. */
export function validateLivestockForPublish(l: { photos: number; quantity: number; priceType: PriceType; priceKzt: number | null; video: boolean; categoryCode: string; regionCode: string | null; lat: number | null }) {
  const errors: string[] = [];
  if (l.photos < MIN_PHOTOS) errors.push("min_photos");
  if (l.quantity < 1) errors.push("quantity");
  if (l.priceType !== "negotiable" && (!l.priceKzt || l.priceKzt <= 0)) errors.push("price");
  if (!l.regionCode) errors.push("region");
  if (l.lat === null) errors.push("location");
  if (l.quantity >= 10 && !l.video) errors.push("video_recommended"); // предупреждение, не ошибка
  return { ok: errors.filter((e) => e !== "video_recommended").length === 0, errors };
}
