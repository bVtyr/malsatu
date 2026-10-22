-- ======================= Логистика (v2) =======================
CREATE TABLE carrier_profiles (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_types  text[] NOT NULL DEFAULT '{}',
  capacity_heads int,
  capacity_tons  numeric(6,1),
  regions        text[] NOT NULL DEFAULT '{}',
  documents      jsonb NOT NULL DEFAULT '[]'::jsonb,
  vehicle_media_ids uuid[] NOT NULL DEFAULT '{}',
  rating         numeric(3,2) NOT NULL DEFAULT 0,
  trips_count    int NOT NULL DEFAULT 0,
  verified       boolean NOT NULL DEFAULT false
);

CREATE TABLE transport_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES users(id),
  deal_id         uuid REFERENCES deals(id),
  from_region     text REFERENCES regions(code),
  from_lat        double precision NOT NULL,
  from_lng        double precision NOT NULL,
  to_region       text REFERENCES regions(code),
  to_lat          double precision NOT NULL,
  to_lng          double precision NOT NULL,
  distance_km     numeric(8,1),
  cargo_kind      text NOT NULL CHECK (cargo_kind IN ('livestock','meat','other')),
  species         text,
  heads           int,
  tons            numeric(6,1),
  date_from       date NOT NULL,
  date_to         date,
  requires_temp   boolean NOT NULL DEFAULT false,
  vet_docs_confirmed boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_transit','delivered','cancelled','blocked_quarantine')),
  chosen_bid_id   uuid,
  combine_allowed boolean NOT NULL DEFAULT true,  -- сборный рейс
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transport_requests_status_idx ON transport_requests(status, date_from);

CREATE TABLE transport_bids (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES transport_requests(id) ON DELETE CASCADE,
  carrier_id uuid NOT NULL REFERENCES users(id),
  price_kzt  bigint NOT NULL,
  vehicle_type text NOT NULL,
  comment    text,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE transport_requests ADD CONSTRAINT transport_requests_bid_fk FOREIGN KEY (chosen_bid_id) REFERENCES transport_bids(id);
ALTER TABLE deals ADD CONSTRAINT deals_transport_fk FOREIGN KEY (transport_request_id) REFERENCES transport_requests(id);

CREATE TABLE transport_tracking (
  id         bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES transport_requests(id) ON DELETE CASCADE,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  temp_c     numeric(4,1),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- ======================= Ветеринария (v2/v3) =======================
CREATE TABLE vet_profiles (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  license_no  text,
  regions     text[] NOT NULL DEFAULT '{}',
  services    text[] NOT NULL DEFAULT '{}',
  price_inspection_kzt bigint,
  rating      numeric(3,2) NOT NULL DEFAULT 0,
  verified    boolean NOT NULL DEFAULT false
);
CREATE TABLE vet_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id     uuid NOT NULL REFERENCES users(id),
  listing_id       uuid REFERENCES listings(id),
  deal_id          uuid REFERENCES deals(id),
  vet_id           uuid REFERENCES users(id),
  status           text NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','scheduled','done','cancelled')),
  scheduled_at     timestamptz,
  price_kzt        bigint,
  report_text      text,
  report_media_ids uuid[] NOT NULL DEFAULT '{}',
  conclusion       text CHECK (conclusion IN ('healthy','issues_found','unfit')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  done_at          timestamptz
);
CREATE TABLE service_requests (   -- забой/разделка, передержка и т.д.
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id),
  provider_id  uuid REFERENCES users(id),
  listing_id   uuid REFERENCES listings(id),
  deal_id      uuid REFERENCES deals(id),
  service_code text NOT NULL,
  options      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {ritual:true, split_parts:true, addresses:[...]}
  scheduled_at timestamptz,
  status       text NOT NULL DEFAULT 'new',
  price_kzt    bigint,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ======================= Складчина (согым, v3) =======================
CREATE TABLE pools (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id             uuid NOT NULL REFERENCES users(id),
  listing_id               uuid REFERENCES listings(id),
  seller_id                uuid REFERENCES users(id),
  species                  text NOT NULL,
  title_ru                 text NOT NULL,
  title_kk                 text NOT NULL,
  total_price_kzt          bigint NOT NULL,
  carcass_weight_kg        numeric(7,1),
  deadline                 timestamptz NOT NULL,
  slaughter_date           date,
  status                   text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','slaughtered','distributed','completed','expired','cancelled')),
  reservation_hold_minutes int NOT NULL DEFAULT 30,
  region_code              text REFERENCES regions(code),
  delivery_included        boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pool_shares (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id          uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  units            smallint NOT NULL CHECK (units IN (1,2,4)),   -- 1/8, 1/4, 1/2
  amount_kzt       bigint NOT NULL,
  status           text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','paid','refunded','delivered','cancelled')),
  parts_preference text[] NOT NULL DEFAULT '{}',   -- казы, жая, қарта
  delivery_address jsonb,
  payment_id       uuid REFERENCES payments(id),
  reserved_at      timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz
);
CREATE INDEX pool_shares_pool_idx ON pool_shares(pool_id);
ALTER TABLE payments ADD CONSTRAINT payments_pool_share_fk FOREIGN KEY (pool_share_id) REFERENCES pool_shares(id);

-- ======================= Аукционы и тендеры (v3) =======================
CREATE TABLE auctions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        uuid NOT NULL REFERENCES listings(id),
  start_price_kzt   bigint NOT NULL,
  bid_step_kzt      bigint NOT NULL,
  deposit_kzt       bigint NOT NULL DEFAULT 0,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  extension_minutes int NOT NULL DEFAULT 5,
  status            text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  stream_url        text,
  winner_bid_id     uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auction_bids (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id  uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  amount_kzt  bigint NOT NULL,
  max_auto_kzt bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auction_deposits (
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id),
  payment_id uuid REFERENCES payments(id),
  status     text NOT NULL DEFAULT 'held',
  PRIMARY KEY (auction_id, user_id)
);
ALTER TABLE auctions ADD CONSTRAINT auctions_winner_fk FOREIGN KEY (winner_bid_id) REFERENCES auction_bids(id);

CREATE TABLE tenders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      uuid NOT NULL REFERENCES users(id),
  title_ru      text NOT NULL,
  title_kk      text NOT NULL,
  category_code text NOT NULL REFERENCES categories(code),
  quantity      int NOT NULL,
  specs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  region_codes  text[] NOT NULL DEFAULT '{}',
  deadline      timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','awarded','cancelled')),
  winner_bid_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tender_bids (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  seller_id  uuid NOT NULL REFERENCES users(id),
  price_kzt  bigint NOT NULL,
  quantity   int NOT NULL,
  comment    text,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenders ADD CONSTRAINT tenders_winner_fk FOREIGN KEY (winner_bid_id) REFERENCES tender_bids(id);

-- ======================= Регулярные заказы, предзаказы (v3) =======================
CREATE TABLE recurring_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         uuid NOT NULL REFERENCES users(id),
  seller_id        uuid NOT NULL REFERENCES users(id),
  listing_id       uuid REFERENCES listings(id),
  quantity_kg      numeric(8,1) NOT NULL,
  weekday          smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  delivery_time    time,
  delivery_address jsonb,
  price_per_kg_kzt bigint,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  next_run_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE preorders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES listings(id),
  slaughter_date  date NOT NULL,
  total_kg        numeric(8,1) NOT NULL,
  reserved_kg     numeric(8,1) NOT NULL DEFAULT 0,
  price_per_kg_kzt bigint NOT NULL,
  status          text NOT NULL DEFAULT 'open'
);
CREATE TABLE preorder_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preorder_id uuid NOT NULL REFERENCES preorders(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  kg          numeric(8,1) NOT NULL,
  deal_id     uuid REFERENCES deals(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ======================= Учёт стада (v3) =======================
CREATE TABLE herd_animals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        uuid REFERENCES organizations(id),
  species       text NOT NULL,
  breed_code    text REFERENCES breeds(code),
  sex           text,
  born_at       date,
  weight_kg     numeric(7,1),
  tag_number    text,
  vaccinations  jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_ids     uuid[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'in_herd' CHECK (status IN ('in_herd','listed','sold','dead')),
  listing_id    uuid REFERENCES listings(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX herd_animals_owner_idx ON herd_animals(owner_id);
ALTER TABLE animal_tags ADD CONSTRAINT animal_tags_herd_fk FOREIGN KEY (herd_animal_id) REFERENCES herd_animals(id) ON DELETE SET NULL;

CREATE TABLE delivery_addresses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      text,
  region_code text REFERENCES regions(code),
  address    text NOT NULL,
  lat        double precision,
  lng        double precision,
  is_default boolean NOT NULL DEFAULT false
);
