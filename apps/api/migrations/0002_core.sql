-- ======================= Справочники =======================
CREATE TABLE regions (
  code         text PRIMARY KEY,
  parent_code  text REFERENCES regions(code) ON DELETE CASCADE,
  level        text NOT NULL CHECK (level IN ('oblast','city','district','rural_okrug','village')),
  name_ru      text NOT NULL,
  name_kk      text NOT NULL,
  slug_ru      text NOT NULL,
  slug_kk      text NOT NULL,
  lat          double precision,
  lng          double precision,
  kato         text,
  enabled      boolean NOT NULL DEFAULT true,
  sort         int NOT NULL DEFAULT 0
);
CREATE INDEX regions_parent_idx ON regions(parent_code);
CREATE UNIQUE INDEX regions_slug_ru_idx ON regions(slug_ru) WHERE parent_code IS NULL;

CREATE TABLE categories (
  code         text PRIMARY KEY,
  parent_code  text REFERENCES categories(code) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('livestock','meat','service')),
  species      text,
  name_ru      text NOT NULL,
  name_kk      text NOT NULL,
  slug_ru      text NOT NULL UNIQUE,
  slug_kk      text NOT NULL UNIQUE,
  icon         text NOT NULL DEFAULT 'paw',
  enabled      boolean NOT NULL DEFAULT true,
  sort         int NOT NULL DEFAULT 0,
  attributes   jsonb NOT NULL DEFAULT '[]'::jsonb   -- конструктор атрибутов (AttributeDef[])
);

CREATE TABLE breeds (
  code     text PRIMARY KEY,
  species  text NOT NULL,
  name_ru  text NOT NULL,
  name_kk  text NOT NULL,
  direction text,
  enabled  boolean NOT NULL DEFAULT true
);

CREATE TABLE document_types (
  code          text PRIMARY KEY,
  name_ru       text NOT NULL,
  name_kk       text NOT NULL,
  applies_to    text[] NOT NULL DEFAULT '{}',
  verifiable_by text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE reject_reasons (
  code    text PRIMARY KEY,
  ru      text NOT NULL,
  kk      text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ======================= Пользователи и доступ =======================
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone              text NOT NULL UNIQUE,
  phone_verified_at  timestamptz,
  display_name       text,
  account_type       text NOT NULL DEFAULT 'individual' CHECK (account_type IN ('individual','ip','kh','too')),
  iin_bin            text,
  iin_bin_verified_at timestamptz,
  verification_level smallint NOT NULL DEFAULT 1 CHECK (verification_level BETWEEN 0 AND 4),
  roles              text[] NOT NULL DEFAULT '{buyer}',
  locale             text NOT NULL DEFAULT 'ru' CHECK (locale IN ('kk','ru')),
  region_code        text REFERENCES regions(code),
  avatar_media_id    uuid,
  farm_name          text,
  about              text,
  herd_summary       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"cattle": 120, "sheep": 800}
  farm_media_ids     uuid[] NOT NULL DEFAULT '{}',
  rating             numeric(3,2) NOT NULL DEFAULT 0,
  reviews_count      int NOT NULL DEFAULT 0,
  deals_count        int NOT NULL DEFAULT 0,
  response_minutes   int,
  trust_score        int NOT NULL DEFAULT 25,
  published_count    int NOT NULL DEFAULT 0,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  is_blocked         boolean NOT NULL DEFAULT false,
  blocked_reason     text,
  last_seen_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX users_region_idx ON users(region_code);
CREATE INDEX users_roles_idx ON users USING gin(roles);

CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  channel     text NOT NULL DEFAULT 'sms',
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_idx ON otp_codes(phone, created_at DESC);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  ip          text,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  name          text NOT NULL,
  org_type      text NOT NULL CHECK (org_type IN ('ip','kh','too')),
  bin           text,
  region_code   text REFERENCES regions(code),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE org_members (
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'org_staff' CHECK (role IN ('org_owner','org_staff')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- ======================= Медиа =======================
CREATE TABLE media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('image','video','audio','document')),
  storage_key   text NOT NULL,
  url           text NOT NULL,
  thumb_url     text,
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL DEFAULT 0,
  width         int,
  height        int,
  duration_sec  int,
  watermarked   boolean NOT NULL DEFAULT false,
  phash         text,                        -- перцептивный хеш для поиска дубликатов
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_phash_idx ON media(phash);
ALTER TABLE users ADD CONSTRAINT users_avatar_fk FOREIGN KEY (avatar_media_id) REFERENCES media(id) ON DELETE SET NULL;

-- ======================= Объявления =======================
CREATE TABLE listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    uuid NOT NULL REFERENCES users(id),
  org_id           uuid REFERENCES organizations(id),
  kind             text NOT NULL CHECK (kind IN ('livestock','meat','service','wanted')),
  category_code    text NOT NULL REFERENCES categories(code),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_moderation','active','rejected','reserved','sold','expired','archived','hidden_quarantine')),
  title_ru         text,
  title_kk         text,
  description_ru   text,
  description_kk   text,
  source_locale    text NOT NULL DEFAULT 'ru' CHECK (source_locale IN ('kk','ru')),
  auto_translated  boolean NOT NULL DEFAULT false,
  price_type       text NOT NULL CHECK (price_type IN ('per_head','per_kg_live','per_kg_meat','per_lot','negotiable')),
  price_kzt        bigint,
  price_per_kg_kzt int,                       -- нормализованная цена за кг (для сортировки/индекса)
  bargain          boolean NOT NULL DEFAULT false,
  quantity         int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  initial_quantity int NOT NULL DEFAULT 1,
  is_lot           boolean NOT NULL DEFAULT false,
  avg_weight_kg    numeric(8,1),
  weight_min_kg    numeric(8,1),
  weight_max_kg    numeric(8,1),
  attributes       jsonb NOT NULL DEFAULT '{}'::jsonb,
  region_code      text NOT NULL REFERENCES regions(code),
  top_region_code  text NOT NULL REFERENCES regions(code),  -- область/город — для индекса цен и SEO
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  location         geography(Point, 4326) NOT NULL,
  address_hidden   boolean NOT NULL DEFAULT true,
  address_text     text,
  delivery_options text[] NOT NULL DEFAULT '{pickup}',
  escrow_available boolean NOT NULL DEFAULT true,
  has_video        boolean NOT NULL DEFAULT false,
  has_docs         boolean NOT NULL DEFAULT false,
  has_tags         boolean NOT NULL DEFAULT false,
  halal            boolean NOT NULL DEFAULT false,
  quarantine_flagged boolean NOT NULL DEFAULT false,
  quarantine_zone_ids uuid[] NOT NULL DEFAULT '{}',
  status_before_quarantine text,
  needed_by        timestamptz,                -- для "Куплю"
  published_at     timestamptz,
  expires_at       timestamptz,
  moderated_at     timestamptz,
  moderated_by     uuid REFERENCES users(id),
  reject_reason_code text REFERENCES reject_reasons(code),
  reject_comment   text,
  views_count      int NOT NULL DEFAULT 0,
  favorites_count  int NOT NULL DEFAULT 0,
  calls_count      int NOT NULL DEFAULT 0,
  messages_count   int NOT NULL DEFAULT 0,
  offers_count     int NOT NULL DEFAULT 0,
  promoted_until   timestamptz,
  promotion_type   text,
  search_vector    tsvector,
  client_draft_id  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE TRIGGER listings_updated BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX listings_status_idx ON listings(status, published_at DESC);
CREATE INDEX listings_owner_idx ON listings(owner_user_id, status);
CREATE INDEX listings_category_idx ON listings(category_code, status);
CREATE INDEX listings_region_idx ON listings(top_region_code, status);
CREATE INDEX listings_location_gix ON listings USING gist(location);
CREATE INDEX listings_attrs_gin ON listings USING gin(attributes jsonb_path_ops);
CREATE INDEX listings_search_gin ON listings USING gin(search_vector);
CREATE INDEX listings_title_trgm ON listings USING gin ((coalesce(title_ru,'') || ' ' || coalesce(title_kk,'')) gin_trgm_ops);
CREATE INDEX listings_price_idx ON listings(price_kzt) WHERE status = 'active';
CREATE UNIQUE INDEX listings_client_draft_idx ON listings(owner_user_id, client_draft_id) WHERE client_draft_id IS NOT NULL;

-- Полнотекстовый вектор (simple-конфигурация: без стемминга, одинаково для kk/ru; синонимы раскрываются на уровне приложения)
CREATE OR REPLACE FUNCTION listings_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title_ru,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title_kk,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.description_ru,''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.description_kk,''))), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.attributes->>'breed','')), 'C');
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER listings_search_vector BEFORE INSERT OR UPDATE OF title_ru, title_kk, description_ru, description_kk, attributes, lat, lng ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_search_vector_update();

CREATE TABLE listing_media (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort       int NOT NULL DEFAULT 0,
  is_cover   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (listing_id, media_id)
);

CREATE TABLE listing_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  doc_type_code   text NOT NULL REFERENCES document_types(code),
  media_id        uuid REFERENCES media(id) ON DELETE SET NULL,
  number          text,
  issued_at       date,
  expires_at      date,
  verified_status text NOT NULL DEFAULT 'pending' CHECK (verified_status IN ('pending','verified','rejected')),
  verified_by     uuid REFERENCES users(id),
  verified_role   text,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_documents_listing_idx ON listing_documents(listing_id);

CREATE TABLE animal_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid REFERENCES listings(id) ON DELETE CASCADE,
  herd_animal_id  uuid,
  tag_number      text NOT NULL,
  verified_status text NOT NULL DEFAULT 'pending' CHECK (verified_status IN ('pending','verified','rejected','not_found')),
  verified_at     timestamptz,
  verified_source text,          -- 'moderator' | 'vet' | 'gov_db'
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX animal_tags_listing_idx ON animal_tags(listing_id);
CREATE INDEX animal_tags_number_idx ON animal_tags(tag_number);

CREATE TABLE favorites (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE saved_searches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  query            jsonb NOT NULL,
  notify           boolean NOT NULL DEFAULT true,
  last_notified_at timestamptz,
  last_seen_count  int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_searches_user_idx ON saved_searches(user_id);

CREATE TABLE view_history (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE comparisons (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

-- ======================= Коммуникации =======================
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id        uuid NOT NULL REFERENCES users(id),
  seller_id       uuid NOT NULL REFERENCES users(id),
  last_message_at timestamptz,
  last_message_preview text,
  buyer_unread    int NOT NULL DEFAULT 0,
  seller_unread   int NOT NULL DEFAULT 0,
  blocked_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX conversations_buyer_idx ON conversations(buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON conversations(seller_id, last_message_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id),
  kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','photo','video','voice','location','offer','system')),
  text            text,
  text_translated text,
  translated_to   text,
  media_id        uuid REFERENCES media(id) ON DELETE SET NULL,
  lat             double precision,
  lng             double precision,
  offer_id        uuid,
  fraud_signals   text[] NOT NULL DEFAULT '{}',
  fraud_score     int NOT NULL DEFAULT 0,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE quick_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       text NOT NULL,
  sort       int NOT NULL DEFAULT 0
);

CREATE TABLE offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  buyer_id        uuid NOT NULL REFERENCES users(id),
  seller_id       uuid NOT NULL REFERENCES users(id),
  from_role       text NOT NULL CHECK (from_role IN ('buyer','seller')),
  price_kzt       bigint NOT NULL,
  quantity        int NOT NULL DEFAULT 1,
  comment         text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','countered','expired','withdrawn')),
  parent_offer_id uuid REFERENCES offers(id),
  expires_at      timestamptz NOT NULL,
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_listing_idx ON offers(listing_id, status);
CREATE INDEX offers_buyer_idx ON offers(buyer_id);
CREATE INDEX offers_seller_idx ON offers(seller_id, status);
ALTER TABLE messages ADD CONSTRAINT messages_offer_fk FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL;

CREATE TABLE masked_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  caller_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  callee_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proxy_number text NOT NULL,
  provider_ref text,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX masked_numbers_lookup ON masked_numbers(listing_id, caller_id);

CREATE TABLE call_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid REFERENCES listings(id) ON DELETE SET NULL,
  caller_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  callee_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  proxy_number text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  duration_sec int,
  status       text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','answered','missed','failed'))
);

-- ======================= Жалобы, модерация, антифрод =======================
CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('listing','user','message')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL,
  comment     text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_target_idx ON reports(target_type, target_id);
CREATE INDEX reports_status_idx ON reports(status, created_at);

CREATE TABLE moderation_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('first_listings','auto_flag','report','random','docs')),
  signals     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  assigned_to uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX moderation_queue_status_idx ON moderation_queue(status, created_at);
CREATE UNIQUE INDEX moderation_queue_pending_listing ON moderation_queue(listing_id) WHERE status = 'pending';

CREATE TABLE moderation_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES users(id),
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid NOT NULL,
  reason_code  text,
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_log_target_idx ON moderation_log(target_type, target_id);

CREATE TABLE blacklist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('phone','iin','card','device')),
  value_hash text NOT NULL,
  reason     text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value_hash)
);

CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- ======================= Карантинные зоны =======================
CREATE TABLE quarantine_zones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ru         text NOT NULL,
  name_kk         text NOT NULL,
  disease         text NOT NULL,
  action          text NOT NULL DEFAULT 'hide' CHECK (action IN ('hide','flag')),
  species         text[],                     -- NULL = все виды
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  geom            geography(Polygon, 4326),
  center_lat      double precision,
  center_lng      double precision,
  radius_km       numeric(7,2),
  block_transport boolean NOT NULL DEFAULT true,
  source          text,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quarantine_zones_geom_gix ON quarantine_zones USING gist(geom);
CREATE INDEX quarantine_zones_active_idx ON quarantine_zones(starts_at, ends_at);
CREATE TRIGGER quarantine_zones_updated BEFORE UPDATE ON quarantine_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ======================= Уведомления =======================
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,     -- message | offer | deal | saved_search | quarantine | price | moderation | system
  title_ru   text NOT NULL,
  title_kk   text NOT NULL,
  body_ru    text,
  body_kk    text,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels   text[] NOT NULL DEFAULT '{push}',
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_unsent_idx ON notifications(sent_at) WHERE sent_at IS NULL;

CREATE TABLE notification_settings (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs              jsonb NOT NULL DEFAULT '{"message":["push","sms"],"offer":["push","sms"],"deal":["push","sms"],"saved_search":["push"],"quarantine":["push","sms"],"price":["push"],"moderation":["push"],"system":["push"]}'::jsonb,
  quiet_from         time,   -- "тихие часы"
  quiet_to           time,
  push_subscriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  email              text,
  telegram_chat_id   text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ======================= Сделки и финансы (v2, схема заложена в MVP) =======================
CREATE TABLE commission_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL DEFAULT '*',
  account_type text NOT NULL DEFAULT '*',
  percent      numeric(5,2) NOT NULL,
  min_kzt      bigint NOT NULL DEFAULT 0,
  max_kzt      bigint,
  priority     int NOT NULL DEFAULT 0,
  enabled      boolean NOT NULL DEFAULT true
);

CREATE TABLE deals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id              uuid NOT NULL REFERENCES listings(id),
  buyer_id                uuid NOT NULL REFERENCES users(id),
  seller_id               uuid NOT NULL REFERENCES users(id),
  offer_id                uuid REFERENCES offers(id),
  mode                    text NOT NULL CHECK (mode IN ('direct','reservation','escrow')),
  kind                    text NOT NULL CHECK (kind IN ('livestock','meat','service')),
  status                  text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','preparing','in_transit','inspection','confirmed','completed','cancelled','disputed','refunded','partially_refunded','released_to_seller')),
  quantity                int NOT NULL DEFAULT 1,
  unit_price_kzt          bigint NOT NULL,
  amount_kzt              bigint NOT NULL,
  prepayment_kzt          bigint NOT NULL DEFAULT 0,  -- для режима "бронь"
  commission_kzt          bigint NOT NULL DEFAULT 0,
  delivery_option         text NOT NULL DEFAULT 'pickup',
  delivery_address        jsonb,
  transport_request_id    uuid,
  inspection_window_hours int NOT NULL DEFAULT 24,
  inspection_started_at   timestamptz,
  paid_at                 timestamptz,
  completed_at            timestamptz,
  cancel_reason           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER deals_updated BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX deals_buyer_idx ON deals(buyer_id, created_at DESC);
CREATE INDEX deals_seller_idx ON deals(seller_id, created_at DESC);
CREATE INDEX deals_status_idx ON deals(status);

CREATE TABLE deal_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id            uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  actor_id           uuid REFERENCES users(id),
  actor_role         text NOT NULL,
  action             text NOT NULL,
  from_status        text NOT NULL,
  to_status          text NOT NULL,
  comment            text,
  evidence_media_ids uuid[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deal_events_deal_idx ON deal_events(deal_id, created_at);

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      uuid REFERENCES deals(id),
  pool_share_id uuid,
  user_id      uuid NOT NULL REFERENCES users(id),
  provider     text NOT NULL,
  provider_ref text,
  method       text,          -- card | qr | bank_app | invoice | installment
  amount_kzt   bigint NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),
  refunded_kzt bigint NOT NULL DEFAULT 0,
  receipt_url  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_deal_idx ON payments(deal_id);

CREATE TABLE payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  deal_id     uuid REFERENCES deals(id),
  amount_kzt  bigint NOT NULL,
  destination jsonb NOT NULL,   -- {type:'card'|'iban', masked:'...'}
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz
);

CREATE TABLE disputes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid NOT NULL UNIQUE REFERENCES deals(id),
  opened_by   uuid NOT NULL REFERENCES users(id),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','awaiting_seller','awaiting_buyer','under_review','resolved')),
  reason      text NOT NULL,
  resolution  text CHECK (resolution IN ('refund','partial_refund','for_seller')),
  refund_kzt  bigint,
  arbiter_id  uuid REFERENCES users(id),
  deadline_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE dispute_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id),
  text       text,
  media_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL REFERENCES deals(id),
  author_id           uuid NOT NULL REFERENCES users(id),
  target_user_id      uuid NOT NULL REFERENCES users(id),
  target_role         text NOT NULL CHECK (target_role IN ('seller','buyer','carrier','vet','slaughter')),
  score_overall       smallint NOT NULL CHECK (score_overall BETWEEN 1 AND 5),
  score_description   smallint,
  score_quality       smallint,
  score_punctuality   smallint,
  score_communication smallint,
  text                text,
  media_ids           uuid[] NOT NULL DEFAULT '{}',
  reply_text          text,
  replied_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, author_id)
);
CREATE INDEX reviews_target_idx ON reviews(target_user_id, created_at DESC);

-- ======================= Монетизация =======================
CREATE TABLE promotions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('bump','highlight','vip','top_region')),
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz NOT NULL,
  price_kzt  bigint NOT NULL,
  payment_id uuid REFERENCES payments(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tariffs (
  code       text PRIMARY KEY,
  name_ru    text NOT NULL,
  name_kk    text NOT NULL,
  kind       text NOT NULL,   -- promotion | subscription | vet_call | analytics
  price_kzt  bigint NOT NULL,
  duration_days int,
  params     jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled    boolean NOT NULL DEFAULT true
);
CREATE TABLE subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  tariff_code text NOT NULL REFERENCES tariffs(code),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'active'
);
CREATE TABLE promo_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('commission_discount','bonus_kzt','promotion_free')),
  value       numeric(12,2) NOT NULL,
  max_uses    int,
  used_count  int NOT NULL DEFAULT 0,
  valid_until timestamptz,
  enabled     boolean NOT NULL DEFAULT true
);
CREATE TABLE referrals (
  inviter_id  uuid NOT NULL REFERENCES users(id),
  invited_id  uuid NOT NULL REFERENCES users(id) UNIQUE,
  bonus_kzt   bigint NOT NULL DEFAULT 0,
  rewarded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ======================= CMS, аудит, аналитика =======================
CREATE TABLE cms_pages (
  slug       text PRIMARY KEY,
  title_ru   text NOT NULL,
  title_kk   text NOT NULL,
  body_ru    text NOT NULL,
  body_kk    text NOT NULL,
  kind       text NOT NULL DEFAULT 'page' CHECK (kind IN ('page','faq','article','legal')),
  published  boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE banners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text,
  media_id      uuid REFERENCES media(id),
  link          text,
  region_codes  text[] NOT NULL DEFAULT '{}',
  roles         text[] NOT NULL DEFAULT '{}',
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  enabled       boolean NOT NULL DEFAULT true
);
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_actor_idx ON audit_log(actor_id, created_at DESC);

CREATE TABLE analytics_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  anon_id    text,
  name       text NOT NULL,      -- listing_view | contact_click | call | message | offer | deal_created | deal_completed
  listing_id uuid,
  props      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_name_idx ON analytics_events(name, created_at);

CREATE TABLE price_index_daily (
  day           date NOT NULL,
  category_code text NOT NULL,
  region_code   text NOT NULL,   -- top-level регион или 'kz'
  unit          text NOT NULL,
  count         int NOT NULL,
  avg_kzt       bigint NOT NULL,
  median_kzt    bigint NOT NULL,
  p25_kzt       bigint NOT NULL,
  p75_kzt       bigint NOT NULL,
  min_kzt       bigint NOT NULL,
  max_kzt       bigint NOT NULL,
  PRIMARY KEY (day, category_code, region_code, unit)
);

-- Счётчик избранного
CREATE OR REPLACE FUNCTION favorites_counter() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE listings SET favorites_count = favorites_count + 1 WHERE id = NEW.listing_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE listings SET favorites_count = greatest(0, favorites_count - 1) WHERE id = OLD.listing_id; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER favorites_counter_trg AFTER INSERT OR DELETE ON favorites FOR EACH ROW EXECUTE FUNCTION favorites_counter();
