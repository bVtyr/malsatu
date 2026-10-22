-- Один активный платёж на сделку и на долю складчины (защита от двойного списания при гонке)
CREATE UNIQUE INDEX payments_one_active_per_deal ON payments(deal_id) WHERE deal_id IS NOT NULL AND status IN ('pending','succeeded');
CREATE UNIQUE INDEX payments_one_active_per_share ON payments(pool_share_id) WHERE pool_share_id IS NOT NULL AND status IN ('pending','succeeded');
-- Одна жалоба от пользователя на объект
CREATE UNIQUE INDEX reports_one_per_reporter ON reports(reporter_id, target_type, target_id) WHERE reporter_id IS NOT NULL AND status = 'open';
-- Публичные (размытые) координаты объявления: по ним считаются расстояние и bbox, точные наружу не выходят
ALTER TABLE listings ADD COLUMN public_lat double precision, ADD COLUMN public_lng double precision;
UPDATE listings SET public_lat = round(lat::numeric, 2)::double precision, public_lng = round(lng::numeric, 2)::double precision;
CREATE OR REPLACE FUNCTION listings_public_point() RETURNS trigger AS $$
BEGIN NEW.public_lat := round(NEW.lat::numeric, 2)::double precision; NEW.public_lng := round(NEW.lng::numeric, 2)::double precision; RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER listings_public_point_trg BEFORE INSERT OR UPDATE OF lat, lng ON listings FOR EACH ROW EXECUTE FUNCTION listings_public_point();
-- Счётчик попыток OTP по телефону за окно (атомарный инкремент в коде)
CREATE INDEX otp_phone_recent_idx ON otp_codes(phone, created_at);

-- Одна выплата на сделку (гонка подтверждений)
CREATE UNIQUE INDEX payouts_one_per_deal ON payouts(deal_id) WHERE deal_id IS NOT NULL;
-- Ручная бронь продавца отличается от автоматической (количество исчерпано сделками)
ALTER TABLE listings ADD COLUMN manual_reserved boolean NOT NULL DEFAULT false;
-- Один оффер → одна сделка
CREATE UNIQUE INDEX deals_one_per_offer ON deals(offer_id) WHERE offer_id IS NOT NULL;
-- Диапазон доверия
ALTER TABLE users ADD CONSTRAINT users_trust_range CHECK (trust_score BETWEEN 0 AND 100);
