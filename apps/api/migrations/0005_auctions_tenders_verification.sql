-- Аукционы, тендеры, заявки на верификацию (v3) + платёжные вебхуки

-- Заявки на повышение уровня верификации (2 — ИИН/БИН, 3 — документы хозяйства, 4 — выезд/видео)
CREATE TABLE verification_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level           smallint NOT NULL CHECK (level BETWEEN 2 AND 4),
  iin_bin         text,
  id_kind         text CHECK (id_kind IN ('iin','bin')),
  document_media_ids uuid[] NOT NULL DEFAULT '{}',
  comment         text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id     uuid REFERENCES users(id),
  review_comment  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE UNIQUE INDEX verification_requests_one_pending ON verification_requests(user_id) WHERE status = 'pending';
CREATE INDEX verification_requests_status_idx ON verification_requests(status, created_at);
-- один и тот же ИИН/БИН не может быть подтверждён у двух аккаунтов
CREATE UNIQUE INDEX users_iin_bin_verified_unique ON users(iin_bin) WHERE iin_bin IS NOT NULL AND iin_bin_verified_at IS NOT NULL;

-- Аукционы
ALTER TABLE auctions ADD COLUMN seller_id uuid REFERENCES users(id);
ALTER TABLE auctions ADD COLUMN current_price_kzt bigint;
ALTER TABLE auctions ADD COLUMN bids_count int NOT NULL DEFAULT 0;
ALTER TABLE auctions ADD COLUMN winner_offer_id uuid REFERENCES offers(id);
ALTER TABLE auctions ADD COLUMN settled_at timestamptz;
CREATE INDEX auctions_status_idx ON auctions(status, ends_at);
CREATE UNIQUE INDEX auctions_one_open_per_listing ON auctions(listing_id) WHERE status IN ('scheduled','live');
CREATE INDEX auction_bids_auction_idx ON auction_bids(auction_id, amount_kzt DESC, created_at);
ALTER TABLE auction_deposits ADD CONSTRAINT auction_deposits_status_chk CHECK (status IN ('pending','held','refunded','applied','forfeited'));

-- Тендеры
ALTER TABLE tender_bids ADD COLUMN listing_id uuid REFERENCES listings(id);
ALTER TABLE tender_bids ADD CONSTRAINT tender_bids_status_chk CHECK (status IN ('pending','won','lost','withdrawn'));
CREATE UNIQUE INDEX tender_bids_one_per_seller ON tender_bids(tender_id, seller_id) WHERE status <> 'withdrawn';
CREATE INDEX tenders_status_idx ON tenders(status, deadline);

-- Платежи: быстрый поиск по ссылке провайдера (вебхук), статус failed допускает повторную попытку
CREATE UNIQUE INDEX payments_provider_ref_unique ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;
