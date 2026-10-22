/** Типы таблиц для Kysely (ручная синхронизация с migrations/*.sql; при желании — kysely-codegen). */
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

type Ts = ColumnType<Date, Date | string, Date | string>;
type TsNullable = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Json<T> = ColumnType<T, string | T, string | T>;

export interface RegionsTable {
  code: string; parent_code: string | null; level: string; name_ru: string; name_kk: string; slug_ru: string; slug_kk: string;
  lat: number | null; lng: number | null; kato: string | null; enabled: Generated<boolean>; sort: Generated<number>;
}
export interface CategoriesTable {
  code: string; parent_code: string | null; kind: string; species: string | null; name_ru: string; name_kk: string; slug_ru: string; slug_kk: string;
  icon: Generated<string>; enabled: Generated<boolean>; sort: Generated<number>; attributes: Json<unknown[]>;
}
export interface BreedsTable { code: string; species: string; name_ru: string; name_kk: string; direction: string | null; enabled: Generated<boolean> }
export interface DocumentTypesTable { code: string; name_ru: string; name_kk: string; applies_to: string[]; verifiable_by: string[] }
export interface RejectReasonsTable { code: string; ru: string; kk: string; enabled: Generated<boolean> }
export interface SettingsTable { key: string; value: Json<unknown>; updated_at: Generated<Date> }

export interface UsersTable {
  id: Generated<string>; phone: string; phone_verified_at: TsNullable; display_name: string | null; account_type: Generated<string>;
  iin_bin: string | null; iin_bin_verified_at: TsNullable; verification_level: Generated<number>; roles: Generated<string[]>; locale: Generated<string>;
  region_code: string | null; avatar_media_id: string | null; farm_name: string | null; about: string | null; herd_summary: Generated<Json<Record<string, number>>>;
  farm_media_ids: Generated<string[]>; rating: Generated<number>; reviews_count: Generated<number>; deals_count: Generated<number>; response_minutes: number | null;
  trust_score: Generated<number>; published_count: Generated<number>; two_factor_enabled: Generated<boolean>; is_blocked: Generated<boolean>; blocked_reason: string | null;
  last_seen_at: TsNullable; created_at: Generated<Date>; updated_at: Generated<Date>; deleted_at: TsNullable;
}
export interface OtpCodesTable { id: Generated<string>; phone: string; code_hash: string; channel: Generated<string>; attempts: Generated<number>; expires_at: Ts; consumed_at: TsNullable; ip: string | null; created_at: Generated<Date> }
export interface SessionsTable { id: Generated<string>; user_id: string; token_hash: string; user_agent: string | null; ip: string | null; expires_at: Ts; revoked_at: TsNullable; created_at: Generated<Date> }
export interface OrganizationsTable { id: Generated<string>; owner_user_id: string; name: string; org_type: string; bin: string | null; region_code: string | null; created_at: Generated<Date> }
export interface OrgMembersTable { org_id: string; user_id: string; role: Generated<string>; permissions: Generated<Json<Record<string, boolean>>>; created_at: Generated<Date> }

export interface MediaTable {
  id: Generated<string>; owner_user_id: string | null; kind: string; storage_key: string; url: string; thumb_url: string | null; mime: string; size_bytes: Generated<number>;
  width: number | null; height: number | null; duration_sec: number | null; watermarked: Generated<boolean>; phash: string | null; status: Generated<string>; created_at: Generated<Date>;
}

export interface ListingsTable {
  id: Generated<string>; owner_user_id: string; org_id: string | null; kind: string; category_code: string; status: Generated<string>;
  title_ru: string | null; title_kk: string | null; description_ru: string | null; description_kk: string | null; source_locale: Generated<string>; auto_translated: Generated<boolean>;
  price_type: string; price_kzt: number | null; price_per_kg_kzt: number | null; bargain: Generated<boolean>; quantity: Generated<number>; initial_quantity: Generated<number>; is_lot: Generated<boolean>;
  avg_weight_kg: number | null; weight_min_kg: number | null; weight_max_kg: number | null; attributes: Json<Record<string, unknown>>;
  region_code: string; top_region_code: string; lat: number; lng: number; public_lat: Generated<number>; public_lng: Generated<number>; location: ColumnType<string, never, never>; address_hidden: Generated<boolean>; address_text: string | null;
  delivery_options: Generated<string[]>; escrow_available: Generated<boolean>; has_video: Generated<boolean>; has_docs: Generated<boolean>; has_tags: Generated<boolean>; halal: Generated<boolean>;
  quarantine_flagged: Generated<boolean>; quarantine_zone_ids: Generated<string[]>; status_before_quarantine: string | null; manual_reserved: Generated<boolean>; needed_by: TsNullable;
  published_at: TsNullable; expires_at: TsNullable; moderated_at: TsNullable; moderated_by: string | null; reject_reason_code: string | null; reject_comment: string | null;
  views_count: Generated<number>; favorites_count: Generated<number>; calls_count: Generated<number>; messages_count: Generated<number>; offers_count: Generated<number>;
  promoted_until: TsNullable; promotion_type: string | null; search_vector: ColumnType<string | null, never, never>; client_draft_id: string | null;
  created_at: Generated<Date>; updated_at: Generated<Date>; deleted_at: TsNullable;
}
export interface ListingMediaTable { listing_id: string; media_id: string; sort: Generated<number>; is_cover: Generated<boolean> }
export interface ListingDocumentsTable {
  id: Generated<string>; listing_id: string; doc_type_code: string; media_id: string | null; number: string | null; issued_at: ColumnType<Date | null, string | null | undefined, string | null>;
  expires_at: ColumnType<Date | null, string | null | undefined, string | null>; verified_status: Generated<string>; verified_by: string | null; verified_role: string | null; verified_at: TsNullable; created_at: Generated<Date>;
}
export interface AnimalTagsTable { id: Generated<string>; listing_id: string | null; herd_animal_id: string | null; tag_number: string; verified_status: Generated<string>; verified_at: TsNullable; verified_source: string | null; created_at: Generated<Date> }
export interface FavoritesTable { user_id: string; listing_id: string; created_at: Generated<Date> }
export interface SavedSearchesTable { id: Generated<string>; user_id: string; name: string; query: Json<Record<string, unknown>>; notify: Generated<boolean>; last_notified_at: TsNullable; last_seen_count: Generated<number>; created_at: Generated<Date> }
export interface ViewHistoryTable { user_id: string; listing_id: string; viewed_at: Generated<Date> }
export interface ComparisonsTable { user_id: string; listing_id: string; created_at: Generated<Date> }

export interface ConversationsTable {
  id: Generated<string>; listing_id: string | null; buyer_id: string; seller_id: string; last_message_at: TsNullable; last_message_preview: string | null;
  buyer_unread: Generated<number>; seller_unread: Generated<number>; blocked_by: string | null; created_at: Generated<Date>;
}
export interface MessagesTable {
  id: Generated<string>; conversation_id: string; sender_id: string; kind: Generated<string>; text: string | null; text_translated: string | null; translated_to: string | null;
  media_id: string | null; lat: number | null; lng: number | null; offer_id: string | null; fraud_signals: Generated<string[]>; fraud_score: Generated<number>; read_at: TsNullable; created_at: Generated<Date>;
}
export interface QuickRepliesTable { id: Generated<string>; user_id: string; text: string; sort: Generated<number> }
export interface OffersTable {
  id: Generated<string>; listing_id: string; conversation_id: string | null; buyer_id: string; seller_id: string; from_role: string; price_kzt: number; quantity: Generated<number>;
  comment: string | null; status: Generated<string>; parent_offer_id: string | null; expires_at: Ts; responded_at: TsNullable; created_at: Generated<Date>;
}
export interface MaskedNumbersTable { id: Generated<string>; listing_id: string; caller_id: string | null; callee_id: string; proxy_number: string; provider_ref: string | null; expires_at: Ts; created_at: Generated<Date> }
export interface CallLogsTable { id: Generated<string>; listing_id: string | null; caller_id: string | null; callee_id: string | null; proxy_number: string | null; started_at: Generated<Date>; duration_sec: number | null; status: Generated<string> }

export interface ReportsTable { id: Generated<string>; reporter_id: string | null; target_type: string; target_id: string; reason: string; comment: string | null; status: Generated<string>; resolved_by: string | null; resolved_at: TsNullable; created_at: Generated<Date> }
export interface ModerationQueueTable { id: Generated<string>; listing_id: string; reason: string; signals: Generated<Json<Record<string, unknown>>>; status: Generated<string>; assigned_to: string | null; created_at: Generated<Date>; resolved_at: TsNullable }
export interface ModerationLogTable { id: Generated<string>; moderator_id: string; action: string; target_type: string; target_id: string; reason_code: string | null; comment: string | null; created_at: Generated<Date> }
export interface BlacklistTable { id: Generated<string>; kind: string; value_hash: string; reason: string | null; created_by: string | null; created_at: Generated<Date> }
export interface UserBlocksTable { blocker_id: string; blocked_id: string; created_at: Generated<Date> }

export interface QuarantineZonesTable {
  id: Generated<string>; name_ru: string; name_kk: string; disease: string; action: Generated<string>; species: string[] | null; starts_at: Ts; ends_at: TsNullable;
  geom: ColumnType<string | null, never, never>; center_lat: number | null; center_lng: number | null; radius_km: number | null; block_transport: Generated<boolean>;
  source: string | null; created_by: string | null; created_at: Generated<Date>; updated_at: Generated<Date>;
}
export interface NotificationsTable {
  id: Generated<string>; user_id: string; type: string; title_ru: string; title_kk: string; body_ru: string | null; body_kk: string | null; data: Generated<Json<Record<string, unknown>>>;
  channels: Generated<string[]>; read_at: TsNullable; sent_at: TsNullable; created_at: Generated<Date>;
}
export interface NotificationSettingsTable { user_id: string; prefs: Generated<Json<Record<string, string[]>>>; quiet_from: string | null; quiet_to: string | null; push_subscriptions: Generated<Json<unknown[]>>; email: string | null; telegram_chat_id: string | null; updated_at: Generated<Date> }

export interface CommissionRulesTable { id: Generated<string>; category: Generated<string>; account_type: Generated<string>; percent: number; min_kzt: Generated<number>; max_kzt: number | null; priority: Generated<number>; enabled: Generated<boolean> }
export interface DealsTable {
  id: Generated<string>; listing_id: string; buyer_id: string; seller_id: string; offer_id: string | null; mode: string; kind: string; status: Generated<string>; quantity: Generated<number>;
  unit_price_kzt: number; amount_kzt: number; prepayment_kzt: Generated<number>; commission_kzt: Generated<number>; delivery_option: Generated<string>; delivery_address: Json<Record<string, unknown>> | null;
  transport_request_id: string | null; inspection_window_hours: Generated<number>; inspection_started_at: TsNullable; paid_at: TsNullable; completed_at: TsNullable; cancel_reason: string | null;
  created_at: Generated<Date>; updated_at: Generated<Date>;
}
export interface DealEventsTable { id: Generated<string>; deal_id: string; actor_id: string | null; actor_role: string; action: string; from_status: string; to_status: string; comment: string | null; evidence_media_ids: Generated<string[]>; created_at: Generated<Date> }
export interface PaymentsTable { id: Generated<string>; deal_id: string | null; pool_share_id: string | null; user_id: string; provider: string; provider_ref: string | null; method: string | null; amount_kzt: number; status: Generated<string>; refunded_kzt: Generated<number>; receipt_url: string | null; created_at: Generated<Date>; updated_at: Generated<Date> }
export interface PayoutsTable { id: Generated<string>; user_id: string; deal_id: string | null; amount_kzt: number; destination: Json<Record<string, unknown>>; status: Generated<string>; created_at: Generated<Date>; paid_at: TsNullable }
export interface DisputesTable { id: Generated<string>; deal_id: string; opened_by: string; status: Generated<string>; reason: string; resolution: string | null; refund_kzt: number | null; arbiter_id: string | null; deadline_at: TsNullable; created_at: Generated<Date>; resolved_at: TsNullable }
export interface DisputeMessagesTable { id: Generated<string>; dispute_id: string; author_id: string; text: string | null; media_ids: Generated<string[]>; created_at: Generated<Date> }
export interface ReviewsTable {
  id: Generated<string>; deal_id: string; author_id: string; target_user_id: string; target_role: string; score_overall: number; score_description: number | null; score_quality: number | null;
  score_punctuality: number | null; score_communication: number | null; text: string | null; media_ids: Generated<string[]>; reply_text: string | null; replied_at: TsNullable; created_at: Generated<Date>;
}
export interface PromotionsTable { id: Generated<string>; listing_id: string; type: string; starts_at: Generated<Date>; ends_at: Ts; price_kzt: number; payment_id: string | null; created_at: Generated<Date> }
export interface TariffsTable { code: string; name_ru: string; name_kk: string; kind: string; price_kzt: number; duration_days: number | null; params: Generated<Json<Record<string, unknown>>>; enabled: Generated<boolean> }
export interface PromoCodesTable { id: Generated<string>; code: string; kind: string; value: number; max_uses: number | null; used_count: Generated<number>; valid_until: TsNullable; enabled: Generated<boolean> }
export interface CmsPagesTable { slug: string; title_ru: string; title_kk: string; body_ru: string; body_kk: string; kind: Generated<string>; published: Generated<boolean>; updated_at: Generated<Date> }
export interface BannersTable { id: Generated<string>; title: string | null; media_id: string | null; link: string | null; region_codes: Generated<string[]>; roles: Generated<string[]>; starts_at: Generated<Date>; ends_at: TsNullable; enabled: Generated<boolean> }
export interface AuditLogTable { id: Generated<number>; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; meta: Generated<Json<Record<string, unknown>>>; ip: string | null; created_at: Generated<Date> }
export interface AnalyticsEventsTable { id: Generated<number>; user_id: string | null; anon_id: string | null; name: string; listing_id: string | null; props: Generated<Json<Record<string, unknown>>>; created_at: Generated<Date> }
export interface PriceIndexDailyTable { day: ColumnType<Date, string, string>; category_code: string; region_code: string; unit: string; count: number; avg_kzt: number; median_kzt: number; p25_kzt: number; p75_kzt: number; min_kzt: number; max_kzt: number }

export interface CarrierProfilesTable { user_id: string; vehicle_types: Generated<string[]>; capacity_heads: number | null; capacity_tons: number | null; regions: Generated<string[]>; documents: Generated<Json<unknown[]>>; vehicle_media_ids: Generated<string[]>; rating: Generated<number>; trips_count: Generated<number>; verified: Generated<boolean> }
export interface TransportRequestsTable {
  id: Generated<string>; requester_id: string; deal_id: string | null; from_region: string | null; from_lat: number; from_lng: number; to_region: string | null; to_lat: number; to_lng: number; distance_km: number | null;
  cargo_kind: string; species: string | null; heads: number | null; tons: number | null; date_from: ColumnType<Date, string, string>; date_to: ColumnType<Date | null, string | null | undefined, string | null>;
  requires_temp: Generated<boolean>; vet_docs_confirmed: Generated<boolean>; status: Generated<string>; chosen_bid_id: string | null; combine_allowed: Generated<boolean>; created_at: Generated<Date>;
}
export interface TransportBidsTable { id: Generated<string>; request_id: string; carrier_id: string; price_kzt: number; vehicle_type: string; comment: string | null; status: Generated<string>; created_at: Generated<Date> }
export interface VetRequestsTable { id: Generated<string>; requester_id: string; listing_id: string | null; deal_id: string | null; vet_id: string | null; status: Generated<string>; scheduled_at: TsNullable; price_kzt: number | null; report_text: string | null; report_media_ids: Generated<string[]>; conclusion: string | null; created_at: Generated<Date>; done_at: TsNullable }
export interface PoolsTable {
  id: Generated<string>; organizer_id: string; listing_id: string | null; seller_id: string | null; species: string; title_ru: string; title_kk: string; total_price_kzt: number; carcass_weight_kg: number | null;
  deadline: Ts; slaughter_date: ColumnType<Date | null, string | null | undefined, string | null>; status: Generated<string>; reservation_hold_minutes: Generated<number>; region_code: string | null; delivery_included: Generated<boolean>; created_at: Generated<Date>;
}
export interface PoolSharesTable { id: Generated<string>; pool_id: string; user_id: string; units: number; amount_kzt: number; status: Generated<string>; parts_preference: Generated<string[]>; delivery_address: Json<Record<string, unknown>> | null; payment_id: string | null; reserved_at: Generated<Date>; paid_at: TsNullable }
export interface VetProfilesTable { user_id: string; license_no: string | null; regions: Generated<string[]>; services: Generated<string[]>; price_inspection_kzt: number | null; rating: Generated<number>; verified: Generated<boolean> }
export interface TransportTrackingTable { id: Generated<number>; request_id: string; lat: number; lng: number; temp_c: number | null; recorded_at: Generated<Date> }
export interface DeliveryAddressesTable { id: Generated<string>; user_id: string; label: string | null; region_code: string | null; address: string; lat: number | null; lng: number | null; is_default: Generated<boolean> }
export interface HerdAnimalsTable { id: Generated<string>; owner_id: string; org_id: string | null; species: string; breed_code: string | null; sex: string | null; born_at: ColumnType<Date | null, string | null | undefined, string | null>; weight_kg: number | null; tag_number: string | null; vaccinations: Generated<Json<unknown[]>>; media_ids: Generated<string[]>; status: Generated<string>; listing_id: string | null; created_at: Generated<Date> }

export interface Database {
  regions: RegionsTable; categories: CategoriesTable; breeds: BreedsTable; document_types: DocumentTypesTable; reject_reasons: RejectReasonsTable; settings: SettingsTable;
  users: UsersTable; otp_codes: OtpCodesTable; sessions: SessionsTable; organizations: OrganizationsTable; org_members: OrgMembersTable; media: MediaTable;
  listings: ListingsTable; listing_media: ListingMediaTable; listing_documents: ListingDocumentsTable; animal_tags: AnimalTagsTable; favorites: FavoritesTable; saved_searches: SavedSearchesTable;
  view_history: ViewHistoryTable; comparisons: ComparisonsTable; conversations: ConversationsTable; messages: MessagesTable; quick_replies: QuickRepliesTable; offers: OffersTable;
  masked_numbers: MaskedNumbersTable; call_logs: CallLogsTable; reports: ReportsTable; moderation_queue: ModerationQueueTable; moderation_log: ModerationLogTable; blacklist: BlacklistTable; user_blocks: UserBlocksTable;
  quarantine_zones: QuarantineZonesTable; notifications: NotificationsTable; notification_settings: NotificationSettingsTable; commission_rules: CommissionRulesTable;
  deals: DealsTable; deal_events: DealEventsTable; payments: PaymentsTable; payouts: PayoutsTable; disputes: DisputesTable; dispute_messages: DisputeMessagesTable; reviews: ReviewsTable;
  promotions: PromotionsTable; tariffs: TariffsTable; promo_codes: PromoCodesTable; cms_pages: CmsPagesTable; banners: BannersTable; audit_log: AuditLogTable; analytics_events: AnalyticsEventsTable; price_index_daily: PriceIndexDailyTable;
  carrier_profiles: CarrierProfilesTable; transport_requests: TransportRequestsTable; transport_bids: TransportBidsTable; vet_requests: VetRequestsTable; pools: PoolsTable; pool_shares: PoolSharesTable;
  delivery_addresses: DeliveryAddressesTable; herd_animals: HerdAnimalsTable; vet_profiles: VetProfilesTable; transport_tracking: TransportTrackingTable;
  auctions: AuctionsTable; auction_bids: AuctionBidsTable; auction_deposits: AuctionDepositsTable; tenders: TendersTable; tender_bids: TenderBidsTable; verification_requests: VerificationRequestsTable;
}

export type User = Selectable<UsersTable>;
export type Listing = Selectable<ListingsTable>;
export type NewListing = Insertable<ListingsTable>;
export type ListingUpdate = Updateable<ListingsTable>;
export type Deal = Selectable<DealsTable>;
