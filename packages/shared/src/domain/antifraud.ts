/** Антифрод в чате и объявлениях: подозрительные фразы (kk/ru), контакты и ссылки в тексте. */
export type FraudSignal = "prepayment_request" | "card_number" | "external_link" | "phone_in_text" | "messenger_redirect" | "banned_word";

export interface FraudCheck { signals: FraudSignal[]; score: number; warn: boolean }

const PREPAY_PATTERNS: RegExp[] = [
  /предоплат/i, /аванс/i, /перевед(и|ите)\s+(деньги|на\s+карт)/i, /скин(ь|ьте)\s+на\s+карт/i, /залог/i, /оплат(а|ите)\s+вперёд/i,
  /алдын\s*ала\s*төле/i, /аванс(ты|пен)/i, /картаға\s+(аудар|сал)/i, /кепіл(дік)?\s*ақша/i, /ақша(ны)?\s+(аудар|жібер)/i,
];
const CARD_PATTERN = /\b(?:\d[ -]?){16}\b/;
const PHONE_PATTERN = /(?:\+7|8)[\s(-]*7\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/;
const LINK_PATTERN = /(https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(kz|ru|com|net|org|me)\b/i;
const MESSENGER_PATTERN = /\b(whatsapp|ватсап|уатсап|telegram|телеграм|t\.me)\b/i;
const BANNED_WORDS: RegExp[] = [/наркот/i, /оружи/i, /есірткі/i, /қару/i];

/** Сообщения в чате: предупреждаем пользователя, не блокируем. */
export function checkMessage(text: string): FraudCheck {
  const signals: FraudSignal[] = [];
  if (PREPAY_PATTERNS.some((r) => r.test(text))) signals.push("prepayment_request");
  if (CARD_PATTERN.test(text)) signals.push("card_number");
  if (LINK_PATTERN.test(text)) signals.push("external_link");
  if (MESSENGER_PATTERN.test(text)) signals.push("messenger_redirect");
  if (BANNED_WORDS.some((r) => r.test(text))) signals.push("banned_word");
  const weights: Record<FraudSignal, number> = {
    prepayment_request: 40, card_number: 50, external_link: 25, phone_in_text: 10, messenger_redirect: 15, banned_word: 100,
  };
  const score = Math.min(100, signals.reduce((a, s) => a + weights[s], 0));
  return { signals, score, warn: score >= 40 };
}

/** Текст объявления: контакты и ссылки запрещены правилами площадки → на модерацию. */
export function checkListingText(text: string): FraudCheck {
  const base = checkMessage(text);
  const signals = [...base.signals];
  if (PHONE_PATTERN.test(text)) signals.push("phone_in_text");
  const score = Math.min(100, base.score + (signals.includes("phone_in_text") ? 30 : 0));
  return { signals, score, warn: score >= 25 };
}

/** Скоринг доверия пользователя (0..100). Используется для лимитов и премодерации. */
export interface TrustInput {
  verificationLevel: 0 | 1 | 2 | 3 | 4;
  completedDeals: number;
  disputesLost: number;
  reportsReceived: number;
  accountAgeDays: number;
  listingsRejected: number;
}

export function trustScore(i: TrustInput): number {
  let s = 10 + i.verificationLevel * 15; // до 70 за верификацию
  s += Math.min(20, i.completedDeals * 2);
  s += Math.min(10, Math.floor(i.accountAgeDays / 30));
  s -= i.disputesLost * 10;
  s -= i.reportsReceived * 3;
  s -= i.listingsRejected * 2;
  return Math.max(0, Math.min(100, s));
}

/** Лимиты для аккаунта по доверию: активные объявления и нужна ли премодерация. */
export function accountLimits(score: number, publishedBefore: number) {
  const premoderate = publishedBefore < 3 || score < 30; // первые 3 объявления новых продавцов — премодерация
  const maxActiveListings = score < 30 ? 5 : score < 60 ? 30 : 500;
  const maxMessagesPerHour = score < 30 ? 30 : 200;
  return { premoderate, maxActiveListings, maxMessagesPerHour };
}
