/** Предложение цены (оффер): buyer → seller; принять / отклонить / встречное. */
export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "expired" | "withdrawn";

export interface OfferLike { status: OfferStatus; priceKzt: number; quantity: number; expiresAt: Date; fromRole: "buyer" | "seller" }

export class OfferError extends Error { constructor(public code: string, m: string) { super(m); } }

export function offerAct(o: OfferLike, action: "accept" | "reject" | "counter" | "withdraw", actorRole: "buyer" | "seller", now = new Date(), counterPrice?: number) {
  if (o.status !== "pending") throw new OfferError("not_pending", "Оффер уже закрыт");
  if (now > o.expiresAt) { o.status = "expired"; throw new OfferError("expired", "Срок оффера истёк"); }
  const isRecipient = actorRole !== o.fromRole;
  if (action === "withdraw") { if (isRecipient) throw new OfferError("forbidden", "Отозвать может только автор"); o.status = "withdrawn"; return o; }
  if (!isRecipient) throw new OfferError("forbidden", "Действие доступно только получателю оффера");
  if (action === "accept") o.status = "accepted";
  else if (action === "reject") o.status = "rejected";
  else {
    if (!counterPrice || counterPrice <= 0) throw new OfferError("bad_price", "Укажите цену встречного предложения");
    o.status = "countered";
  }
  return o;
}

export const OFFER_TTL_HOURS = 48;
