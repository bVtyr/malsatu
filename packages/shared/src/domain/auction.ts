/** Онлайн-аукцион (v3): ставки, шаг, автоставка, продление при ставке в последние минуты, депозит. */
export interface AuctionLike {
  status: "scheduled" | "live" | "ended" | "cancelled";
  startPriceKzt: number;
  bidStepKzt: number;
  endsAt: Date;
  extensionMinutes: number;   // продление, если ставка в последние N минут
  depositKzt: number;
  bids: Array<{ userId: string; amountKzt: number; at: Date; maxAutoKzt?: number }>;
}

export class AuctionError extends Error { constructor(public code: string, m: string) { super(m); } }

export function currentPrice(a: AuctionLike): number {
  return a.bids.length ? Math.max(...a.bids.map((b) => b.amountKzt)) : a.startPriceKzt - a.bidStepKzt;
}

export function minNextBid(a: AuctionLike): number {
  return a.bids.length ? currentPrice(a) + a.bidStepKzt : a.startPriceKzt;
}

export function placeBid(a: AuctionLike, userId: string, amountKzt: number, depositPaid: boolean, now = new Date(), maxAutoKzt?: number) {
  if (a.status !== "live") throw new AuctionError("not_live", "Аукцион не идёт");
  if (now >= a.endsAt) throw new AuctionError("ended", "Аукцион завершён");
  if (a.depositKzt > 0 && !depositPaid) throw new AuctionError("deposit_required", "Нужен депозит для участия");
  if (amountKzt < minNextBid(a)) throw new AuctionError("too_low", `Минимальная ставка ${minNextBid(a)}`);
  a.bids.push({ userId, amountKzt, at: now, maxAutoKzt });
  // автоставка конкурента: если у лидера до этого был maxAuto выше новой ставки — он перебивает на шаг
  const prev = a.bids.length >= 2 ? a.bids[a.bids.length - 2] : undefined;
  if (prev && prev.userId !== userId && prev.maxAutoKzt && prev.maxAutoKzt >= amountKzt + a.bidStepKzt) {
    a.bids.push({ userId: prev.userId, amountKzt: amountKzt + a.bidStepKzt, at: now, maxAutoKzt: prev.maxAutoKzt });
  }
  // анти-снайпинг
  const remainingMs = a.endsAt.getTime() - now.getTime();
  if (remainingMs < a.extensionMinutes * 60_000) a.endsAt = new Date(now.getTime() + a.extensionMinutes * 60_000);
  return a;
}

export function winner(a: AuctionLike) {
  if (!a.bids.length) return null;
  return a.bids.reduce((best, b) => (b.amountKzt > best.amountKzt ? b : best));
}
