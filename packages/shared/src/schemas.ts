import { z } from "zod";
import { normalizeKzPhone } from "./domain/phone.js";

/** Булево из query-строки: "true"/"1" → true, остальное → false (z.coerce.boolean() считает "false" истиной). */
const BoolQuery = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === "true" || v === "1").optional();

export const PhoneSchema = z.string().transform((v, ctx) => {
  const n = normalizeKzPhone(v);
  if (!n) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_phone" }); return z.NEVER; }
  return n;
});

export const OtpRequestSchema = z.object({ phone: PhoneSchema, channel: z.enum(["sms", "whatsapp", "telegram"]).default("sms") });
export const OtpVerifySchema = z.object({ phone: PhoneSchema, code: z.string().regex(/^\d{4,8}$/) });

export const AccountTypeSchema = z.enum(["individual", "ip", "kh", "too"]);
export const ProfileUpdateSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  accountType: AccountTypeSchema.optional(),
  regionCode: z.string().optional(),
  locale: z.enum(["kk", "ru"]).optional(),
  farmName: z.string().max(200).optional(),
  about: z.string().max(2000).optional(),
  herdSummary: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const PriceTypeSchema = z.enum(["per_head", "per_kg_live", "per_kg_meat", "per_lot", "negotiable"]);
export const ListingKindSchema = z.enum(["livestock", "meat", "service", "wanted"]);
export const DeliveryOptionSchema = z.enum(["pickup", "seller_delivery", "platform_carrier"]);

export const ListingUpsertSchema = z.object({
  kind: ListingKindSchema,
  categoryCode: z.string().min(1),
  titleRu: z.string().min(3).max(140).optional(),
  titleKk: z.string().min(3).max(140).optional(),
  descriptionRu: z.string().max(5000).optional(),
  descriptionKk: z.string().max(5000).optional(),
  sourceLocale: z.enum(["kk", "ru"]).default("ru"),
  priceType: PriceTypeSchema,
  priceKzt: z.number().int().positive().max(1_000_000_000_000).nullable().optional(),
  bargain: z.boolean().default(false),
  quantity: z.number().int().positive().max(1_000_000).default(1),
  isLot: z.boolean().default(false),
  avgWeightKg: z.number().positive().nullable().optional(),
  weightMinKg: z.number().positive().nullable().optional(),
  weightMaxKg: z.number().positive().nullable().optional(),
  attributes: z.record(z.string().max(64), z.any()).default({}).refine((a) => JSON.stringify(a).length <= 20_000, { message: "attributes_too_large" }),
  tagNumbers: z.array(z.string().min(3).max(40)).max(5000).default([]),
  regionCode: z.string().min(1),
  lat: z.number().min(40).max(56),
  lng: z.number().min(46).max(88),
  addressHidden: z.boolean().default(true),
  deliveryOptions: z.array(DeliveryOptionSchema).default(["pickup"]),
  escrowAvailable: z.boolean().default(true),
  mediaIds: z.array(z.string().uuid()).default([]),
  documentIds: z.array(z.string().uuid()).default([]),
  neededBy: z.string().datetime().nullable().optional(), // для "Куплю"
  clientDraftId: z.string().max(64).optional(),          // идемпотентность офлайн-черновиков
}).refine((v) => v.titleRu || v.titleKk, { message: "title_required", path: ["titleRu"] })
  .refine((v) => v.priceType === "negotiable" || (v.priceKzt ?? 0) > 0, { message: "price_required", path: ["priceKzt"] });
export type ListingUpsert = z.infer<typeof ListingUpsertSchema>;

export const ListingSearchSchema = z.object({
  q: z.string().max(200).optional(),
  kind: ListingKindSchema.optional(),
  category: z.string().optional(),
  region: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().min(1).max(2000).optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  priceType: PriceTypeSchema.optional(),
  qtyMin: z.coerce.number().optional(),
  breed: z.string().optional(),
  sex: z.string().optional(),
  ageMin: z.coerce.number().optional(),
  ageMax: z.coerce.number().optional(),
  weightMin: z.coerce.number().optional(),
  weightMax: z.coerce.number().optional(),
  purpose: z.string().optional(),
  withDocs: BoolQuery,
  withTags: BoolQuery,
  verifiedOnly: BoolQuery,
  halal: BoolQuery,
  withDelivery: BoolQuery,
  escrow: BoolQuery,
  withVideo: BoolQuery,
  publishedSince: z.string().datetime().optional(),
  owner: z.string().uuid().optional(),
  sort: z.enum(["new", "cheap", "expensive", "near", "rating", "per_kg"]).default("new"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListingSearch = z.infer<typeof ListingSearchSchema>;

export const MessageSchema = z.object({
  text: z.string().max(4000).optional(),
  mediaId: z.string().uuid().optional(),
  kind: z.enum(["text", "photo", "video", "voice", "location", "offer"]).default("text"),
  lat: z.number().optional(), lng: z.number().optional(),
}).refine((m) => m.text || m.mediaId || m.kind === "location", { message: "empty_message" });

export const OfferCreateSchema = z.object({ listingId: z.string().uuid(), priceKzt: z.number().int().positive().max(1_000_000_000_000), quantity: z.number().int().positive().max(1_000_000).default(1), comment: z.string().max(500).optional() });
export const OfferActSchema = z.object({ action: z.enum(["accept", "reject", "counter", "withdraw"]), counterPriceKzt: z.number().int().positive().optional() });

export const SavedSearchSchema = z.object({ name: z.string().min(1).max(80), query: ListingSearchSchema.partial(), notify: z.boolean().default(true) });
export const ReportSchema = z.object({ targetType: z.enum(["listing", "user", "message"]), targetId: z.string().uuid(), reason: z.enum(["fraud", "prepayment", "fake_photos", "wrong_info", "prohibited", "spam", "other"]), comment: z.string().max(1000).optional() });
export const ModerationDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]), reasonCode: z.string().optional(), comment: z.string().max(1000).optional() });

export const QuarantineZoneSchema = z.object({
  nameRu: z.string().min(2), nameKk: z.string().min(2),
  disease: z.enum(["fmd", "brucellosis", "anthrax", "asf", "avian_flu", "rabies", "other"]),
  action: z.enum(["hide", "flag"]).default("hide"),
  species: z.array(z.string()).nullable().default(null),
  startsAt: z.string().datetime(), endsAt: z.string().datetime().nullable().default(null),
  centerLat: z.number().optional(), centerLng: z.number().optional(), radiusKm: z.number().positive().optional(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  blockTransport: z.boolean().default(true),
  source: z.string().max(200).optional(),
}).refine((v) => (v.centerLat != null && v.centerLng != null && v.radiusKm != null) || !!v.polygon, { message: "geometry_required" });

export const DealCreateSchema = z.object({
  listingId: z.string().uuid(), mode: z.enum(["direct", "reservation", "escrow"]), quantity: z.number().int().positive().max(1_000_000).default(1),
  offerId: z.string().uuid().optional(), deliveryOption: DeliveryOptionSchema.default("pickup"), deliveryAddressId: z.string().uuid().optional(),
});
export const DealActionSchema = z.object({ action: z.enum(["start_preparing", "ship", "arrive", "confirm", "cancel", "open_dispute"]), evidenceMediaIds: z.array(z.string().uuid()).optional(), comment: z.string().max(2000).optional() });
