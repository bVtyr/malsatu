/**
 * Складчина (согым): организатор создаёт сбор на тушу; участники бронируют доли (1/2, 1/4, 1/8) и оплачивают.
 * Доли считаем в «восьмушках» (units of 1/8), чтобы работать с целыми числами: 8 единиц = целая туша.
 */
export type ShareFraction = "1/2" | "1/4" | "1/8";
export const SHARE_UNITS: Record<ShareFraction, number> = { "1/2": 4, "1/4": 2, "1/8": 1 };
export const POOL_TOTAL_UNITS = 8;

export type PoolStatus = "open" | "filled" | "slaughtered" | "distributed" | "completed" | "expired" | "cancelled";
export type ShareStatus = "reserved" | "paid" | "refunded" | "delivered" | "cancelled";

export interface PoolShare {
  id: string;
  userId: string;
  units: number;
  status: ShareStatus;
  amountKzt: number;
  reservedAt: Date;
}

export interface PoolLike {
  status: PoolStatus;
  totalPriceKzt: number; // цена туши целиком (с продавцом)
  deadline: Date;
  shares: PoolShare[];
  reservationHoldMinutes: number; // сколько держим неоплаченную бронь
}

export function unitsTaken(pool: PoolLike, now = new Date()): number {
  return pool.shares
    .filter((s) => s.status === "paid" || (s.status === "reserved" && !reservationExpired(s, pool, now)))
    .reduce((a, s) => a + s.units, 0);
}

export function unitsPaid(pool: PoolLike): number {
  return pool.shares.filter((s) => s.status === "paid").reduce((a, s) => a + s.units, 0);
}

export function unitsFree(pool: PoolLike, now = new Date()): number {
  return POOL_TOTAL_UNITS - unitsTaken(pool, now);
}

export function reservationExpired(share: PoolShare, pool: PoolLike, now = new Date()): boolean {
  return share.status === "reserved" && now.getTime() - share.reservedAt.getTime() > pool.reservationHoldMinutes * 60_000;
}

/** Цена доли = пропорциональная часть стоимости туши, округлённая вверх до тенге. */
export function sharePrice(pool: PoolLike, fraction: ShareFraction): number {
  return Math.ceil((pool.totalPriceKzt * SHARE_UNITS[fraction]) / POOL_TOTAL_UNITS);
}

export class PoolError extends Error {
  constructor(public code: string, msg: string) { super(msg); }
}

export function reserveShare(pool: PoolLike, userId: string, fraction: ShareFraction, id: string, now = new Date()): PoolShare {
  if (pool.status !== "open") throw new PoolError("pool_not_open", "Сбор закрыт");
  if (now > pool.deadline) throw new PoolError("deadline_passed", "Срок сбора истёк");
  const units = SHARE_UNITS[fraction];
  if (units > unitsFree(pool, now)) throw new PoolError("not_enough_units", "Недостаточно свободных долей");
  const share: PoolShare = { id, userId, units, status: "reserved", amountKzt: sharePrice(pool, fraction), reservedAt: now };
  pool.shares.push(share);
  return share;
}

export function payShare(pool: PoolLike, shareId: string, now = new Date()): PoolShare {
  if (pool.status !== "open") throw new PoolError("pool_not_open", "Сбор закрыт");
  if (now > pool.deadline) throw new PoolError("deadline_passed", "Срок сбора истёк");
  const s = pool.shares.find((x) => x.id === shareId);
  if (!s) throw new PoolError("share_not_found", "Доля не найдена");
  if (s.status !== "reserved") throw new PoolError("share_not_reserved", "Доля не в статусе брони");
  if (reservationExpired(s, pool, now)) {
    s.status = "cancelled";
    throw new PoolError("reservation_expired", "Бронь истекла, забронируйте заново");
  }
  s.status = "paid";
  if (unitsPaid(pool) === POOL_TOTAL_UNITS) pool.status = "filled";
  return s;
}

/** Проверка по дедлайну: если туша не набрана — сбор истекает и все оплаченные доли возвращаются. */
export function settleDeadline(pool: PoolLike, now = new Date()): { refunds: PoolShare[] } {
  if (pool.status !== "open") return { refunds: [] };
  if (now < pool.deadline) return { refunds: [] };
  const refunds: PoolShare[] = [];
  for (const s of pool.shares) {
    if (s.status === "paid") { s.status = "refunded"; refunds.push(s); }
    else if (s.status === "reserved") s.status = "cancelled";
  }
  pool.status = "expired";
  return { refunds };
}

/** Распределение частей туши между участниками (казы, жая, қарта — по договорённости, здесь пропорционально). */
export function distributeMeat(pool: PoolLike, carcassWeightKg: number) {
  const paid = pool.shares.filter((s) => s.status === "paid");
  return paid.map((s) => ({ shareId: s.id, userId: s.userId, units: s.units, kg: Math.round((carcassWeightKg * s.units) / POOL_TOTAL_UNITS * 10) / 10 }));
}
