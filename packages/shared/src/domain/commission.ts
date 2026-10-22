/** Комиссии платформы. Правила настраиваются в админке и хранятся в таблице commission_rules. */
export type AccountType = "individual" | "ip" | "kh" | "too";
export type FeeCategory = "livestock" | "breeding" | "meat" | "service" | "transport" | "vet";

export interface CommissionRule {
  category: FeeCategory | "*";
  accountType: AccountType | "*";
  percent: number;       // 0..100
  minKzt: number;        // минимальная комиссия
  maxKzt?: number | null; // потолок (опционально)
  priority: number;      // выше — важнее
}

export const DEFAULT_COMMISSION_RULES: CommissionRule[] = [
  { category: "*", accountType: "*", percent: 3, minKzt: 1000, maxKzt: null, priority: 0 },
  { category: "livestock", accountType: "*", percent: 2.5, minKzt: 2000, maxKzt: 150000, priority: 10 },
  { category: "breeding", accountType: "*", percent: 2, minKzt: 5000, maxKzt: 300000, priority: 10 },
  { category: "meat", accountType: "*", percent: 4, minKzt: 500, maxKzt: null, priority: 10 },
  { category: "service", accountType: "*", percent: 10, minKzt: 500, maxKzt: null, priority: 10 },
  { category: "transport", accountType: "*", percent: 7, minKzt: 1000, maxKzt: null, priority: 10 },
  { category: "vet", accountType: "*", percent: 15, minKzt: 500, maxKzt: null, priority: 10 },
  { category: "livestock", accountType: "too", percent: 2, minKzt: 2000, maxKzt: 150000, priority: 20 },
  { category: "livestock", accountType: "kh", percent: 2, minKzt: 2000, maxKzt: 150000, priority: 20 },
];

export function pickRule(rules: CommissionRule[], category: FeeCategory, accountType: AccountType): CommissionRule | null {
  const matching = rules.filter(
    (r) => (r.category === "*" || r.category === category) && (r.accountType === "*" || r.accountType === accountType),
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.priority - a.priority || specificity(b) - specificity(a));
  return matching[0]!;
}

function specificity(r: CommissionRule) {
  return (r.category === "*" ? 0 : 1) + (r.accountType === "*" ? 0 : 1);
}

/** Комиссия в тенге (целое). Округление вверх до тенге. */
export function calcCommission(
  amountKzt: number,
  category: FeeCategory,
  accountType: AccountType,
  rules: CommissionRule[] = DEFAULT_COMMISSION_RULES,
  promoDiscountPercent = 0,
): { commissionKzt: number; rule: CommissionRule | null } {
  if (amountKzt <= 0) return { commissionKzt: 0, rule: null };
  const rule = pickRule(rules, category, accountType);
  if (!rule) return { commissionKzt: 0, rule: null };
  let fee = Math.ceil((amountKzt * rule.percent) / 100);
  fee = Math.max(fee, rule.minKzt);
  if (rule.maxKzt != null) fee = Math.min(fee, rule.maxKzt);
  if (promoDiscountPercent > 0) fee = Math.ceil(fee * (1 - Math.min(100, promoDiscountPercent) / 100));
  fee = Math.min(fee, amountKzt);
  return { commissionKzt: fee, rule };
}
