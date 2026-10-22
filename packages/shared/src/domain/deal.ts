/**
 * Сделка. Режимы: DIRECT (витрина), RESERVATION (бронь с предоплатой), ESCROW (безопасная сделка).
 * Статусы: created → paid → preparing → in_transit → inspection → confirmed → completed
 * Альтернативные ветки: cancelled / disputed → (refunded | partially_refunded | released_to_seller)
 */
export type DealMode = "direct" | "reservation" | "escrow";
export type DealStatus =
  | "created"
  | "paid"
  | "preparing"
  | "in_transit"
  | "inspection"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "disputed"
  | "refunded"
  | "partially_refunded"
  | "released_to_seller";

export type DealActor = "buyer" | "seller" | "carrier" | "system" | "arbiter" | "admin";
export type DealAction =
  | "pay"
  | "start_preparing"
  | "ship"
  | "arrive"
  | "confirm"
  | "auto_confirm"
  | "complete"
  | "cancel"
  | "open_dispute"
  | "resolve_refund"
  | "resolve_partial_refund"
  | "resolve_for_seller";

export type DealKind = "livestock" | "meat" | "service";

export interface DealLike {
  mode: DealMode;
  status: DealStatus;
  kind: DealKind;
  amountKzt: number;
  inspectionWindowHours: number;
  inspectionStartedAt?: Date | null;
  paidAt?: Date | null;
}

export const DEAL_TERMINAL: DealStatus[] = [
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "released_to_seller",
];

/** Таблица переходов: статус → действие → (кто может, новый статус). */
const TRANSITIONS: Record<DealStatus, Partial<Record<DealAction, { by: DealActor[]; to: DealStatus }>>> = {
  created: {
    pay: { by: ["system"], to: "paid" }, // только после подтверждения платёжного провайдера
    confirm: { by: ["seller"], to: "confirmed" }, // прямая договорённость: продавец отмечает, что передал товар
    cancel: { by: ["buyer", "seller", "admin"], to: "cancelled" },
  },
  paid: {
    start_preparing: { by: ["seller"], to: "preparing" },
    cancel: { by: ["seller", "admin"], to: "cancelled" }, // покупатель после оплаты — только через спор
    open_dispute: { by: ["buyer"], to: "disputed" },
  },
  preparing: {
    ship: { by: ["seller", "carrier"], to: "in_transit" },
    arrive: { by: ["seller", "buyer"], to: "inspection" }, // самовывоз: сразу осмотр
    cancel: { by: ["seller", "admin"], to: "cancelled" },
    open_dispute: { by: ["buyer"], to: "disputed" },
  },
  in_transit: {
    arrive: { by: ["carrier", "seller", "buyer"], to: "inspection" },
    open_dispute: { by: ["buyer", "seller"], to: "disputed" },
  },
  inspection: {
    confirm: { by: ["buyer"], to: "confirmed" },
    auto_confirm: { by: ["system"], to: "confirmed" },
    open_dispute: { by: ["buyer"], to: "disputed" },
  },
  confirmed: {
    complete: { by: ["system", "admin"], to: "completed" }, // выплата продавцу выполнена
  },
  disputed: {
    resolve_refund: { by: ["arbiter", "admin"], to: "refunded" },
    resolve_partial_refund: { by: ["arbiter", "admin"], to: "partially_refunded" },
    resolve_for_seller: { by: ["arbiter", "admin"], to: "released_to_seller" },
  },
  completed: {},
  cancelled: {},
  refunded: {},
  partially_refunded: {},
  released_to_seller: {},
};

export class DealTransitionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function canTransition(deal: DealLike, action: DealAction, actor: DealActor): boolean {
  const t = TRANSITIONS[deal.status][action];
  if (!t) return false;
  if (!t.by.includes(actor)) return false;
  if (deal.mode === "direct" && action === "pay") return false; // прямая сделка — без оплаты через платформу
  if (deal.mode !== "direct" && deal.status === "created" && action === "confirm") return false; // без оплаты подтверждать нечего
  return true;
}

/** Применяет действие и возвращает новый статус. Бросает DealTransitionError при недопустимом переходе. */
export function applyDealAction(
  deal: DealLike,
  action: DealAction,
  actor: DealActor,
  now = new Date(),
): { status: DealStatus; inspectionStartedAt?: Date } {
  const t = TRANSITIONS[deal.status][action];
  if (!t) throw new DealTransitionError("invalid_transition", `Нельзя "${action}" из статуса "${deal.status}"`);
  if (!t.by.includes(actor)) throw new DealTransitionError("forbidden_actor", `Действие "${action}" недоступно для ${actor}`);
  if (deal.mode === "direct" && action === "pay") throw new DealTransitionError("direct_no_payment", "Прямая сделка не оплачивается через платформу");
  if (deal.mode !== "direct" && deal.status === "created" && action === "confirm") throw new DealTransitionError("not_paid", "Сделка ещё не оплачена");
  if (action === "auto_confirm") {
    if (!inspectionWindowExpired(deal, now)) throw new DealTransitionError("window_open", "Окно осмотра ещё не истекло");
  }
  if (action === "open_dispute" && deal.status === "inspection" && inspectionWindowExpired(deal, now)) {
    throw new DealTransitionError("window_closed", "Окно осмотра истекло, спор открыть нельзя");
  }
  const res: { status: DealStatus; inspectionStartedAt?: Date } = { status: t.to };
  if (t.to === "inspection") res.inspectionStartedAt = now;
  return res;
}

export function inspectionWindowExpired(deal: DealLike, now = new Date()): boolean {
  if (!deal.inspectionStartedAt) return false;
  const ms = deal.inspectionWindowHours * 3600 * 1000;
  return now.getTime() - deal.inspectionStartedAt.getTime() >= ms;
}

/** Окно осмотра по умолчанию: скот — 24 ч, мясо — 4 ч (подтверждение при получении), услуги — 24 ч. */
export function defaultInspectionWindowHours(kind: DealKind): number {
  return kind === "meat" ? 4 : 24;
}

export function isDealTerminal(status: DealStatus): boolean {
  return DEAL_TERMINAL.includes(status);
}

/** Какие деньги кому при закрытии сделки. */
export function settlement(deal: DealLike, commissionKzt: number, partialRefundKzt = 0) {
  const amount = deal.amountKzt;
  switch (deal.status) {
    case "completed":
    case "released_to_seller":
      return { toSeller: amount - commissionKzt, toBuyer: 0, platformFee: commissionKzt };
    case "refunded":
    case "cancelled":
      return { toSeller: 0, toBuyer: amount, platformFee: 0 };
    case "partially_refunded": {
      const refund = Math.min(Math.max(0, partialRefundKzt), amount);
      const rest = amount - refund;
      const fee = Math.min(commissionKzt, rest);
      return { toSeller: rest - fee, toBuyer: refund, platformFee: fee };
    }
    default:
      return { toSeller: 0, toBuyer: 0, platformFee: 0 };
  }
}
