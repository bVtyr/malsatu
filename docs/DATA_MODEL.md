# Модель данных

Источник правды — `apps/api/migrations/*.sql`; типы Kysely — `apps/api/src/db/types.ts`. Все id — UUID, деньги — `bigint` в тенге, время — `timestamptz`.

## 1. Сущности и связи

```
regions (дерево: область/город → район → сельский округ → село)
categories (дерево; kind: livestock|meat|service; attributes JSONB — конструктор полей)
breeds, document_types, reject_reasons, settings, tariffs, commission_rules

users ──< sessions, otp_codes, notification_settings, quick_replies, delivery_addresses, herd_animals
users ──< organizations (owner) ──< org_members (RBAC внутри хозяйства)
users ──< carrier_profiles / vet_profiles (1:1 по роли)

listings (owner → users, category, region, top_region, location geography)
   ├──< listing_media ──> media (pHash, watermark)
   ├──< listing_documents ──> document_types (verified_status/by/role)
   ├──< animal_tags (ИНЖ, verified_status)
   ├──< favorites, view_history, comparisons, saved_searches(query JSONB)
   ├──< conversations ──< messages (fraud_signals, text_translated)
   ├──< offers (parent_offer_id — встречные)
   ├──< masked_numbers, call_logs
   ├──< reports, moderation_queue, promotions
   └──< deals ──< deal_events, payments, payouts, disputes ──< dispute_messages, reviews
quarantine_zones (geom polygon | center+radius; species[]; action hide|flag; block_transport)
transport_requests ──< transport_bids, transport_tracking;  deals.transport_request_id
vet_requests (listing/deal → vet, report, conclusion); service_requests (забой/разделка/передержка)
pools ──< pool_shares ──> payments            (складчина/согым)
auctions ──< auction_bids, auction_deposits   (v3)
tenders ──< tender_bids                        (v3, обратный аукцион)
recurring_orders, preorders ──< preorder_items (v3)
notifications, analytics_events, audit_log, moderation_log, blacklist, user_blocks, cms_pages, banners, promo_codes, referrals, subscriptions
price_index_daily (day × category × region('kz'|область) × unit → count/avg/median/p25/p75/min/max)
```

## 2. Ключевые поля объявления

| Поле | Назначение |
|---|---|
| `kind` | `livestock` / `meat` / `service` / `wanted` («Куплю») |
| `price_type`, `price_kzt`, `price_per_kg_kzt` | за голову / кг живого / кг мяса / партию / договорная; нормализованная цена за кг — для сортировки и индекса |
| `quantity`, `initial_quantity`, `is_lot`, `avg/min/max_weight_kg` | партия, частичная продажа (quantity уменьшается, при 0 → `sold`) |
| `attributes` JSONB | значения по конструктору категории: порода, пол, возраст, упитанность, назначение, бирки, халал, дата/место забоя… |
| `region_code`, `top_region_code`, `lat/lng`, `location`, `address_hidden` | привязка к населённому пункту и точке; публично точка размывается |
| `has_video/has_docs/has_tags/halal/escrow_available/delivery_options` | денормализованные флаги для фильтров |
| `quarantine_flagged`, `quarantine_zone_ids`, `status_before_quarantine` | эффект карантина и восстановление |
| `search_vector` | tsvector (триггер), веса: заголовки A, описания B, порода C |
| `client_draft_id` | идемпотентность офлайн-черновиков |

## 3. Статусы

### Объявление
`draft → pending_moderation → active ⇄ reserved → sold`; `active → expired` (30 дней, продление); `rejected` (с причиной из справочника); `archived`; `hidden_quarantine` (автоматически, с возвратом в прежний статус). Допустимые переходы владельца — `ownerCanSet()` в `shared/domain/listing.ts`.

### Сделка (`deals.status`)
```
created ─pay─► paid ─start_preparing─► preparing ─ship─► in_transit ─arrive─► inspection ─confirm/auto_confirm─► confirmed ─complete─► completed
   │              │                      │  └──arrive (самовывоз)──────────────────┘    │
   └cancel        └cancel(seller)        └cancel(seller)                                 └open_dispute(buyer, в окне осмотра)
 paid/preparing/in_transit ─open_dispute─► disputed ─resolve_*─► refunded | partially_refunded | released_to_seller
```
Режимы: `direct` (без оплаты), `reservation` (предоплата 20 %), `escrow` (100 % удерживается). Окно осмотра: 24 ч скот / 4 ч мясо (настраивается в `settings`).

### Оффер
`pending → accepted | rejected | countered (создаётся дочерний оффер) | withdrawn | expired (48 ч)`.

### Складчина (`pools.status` / `pool_shares.status`)
`open → filled → slaughtered → distributed → completed`; `open → expired` (дедлайн, возвраты) / `cancelled`. Доли: `reserved (30 мин) → paid → delivered`; `refunded` / `cancelled`.

### Перевозка
`open → assigned → in_transit → delivered`; `cancelled`; `blocked_quarantine`.

### Ветосмотр
`new → assigned → scheduled → done`; `cancelled`. Отчёт прикрепляется к сделке (`deal_id`).

### Спор
`open → awaiting_seller ⇄ awaiting_buyer → under_review → resolved` (resolution: refund | partial_refund | for_seller).

### Модерация
`moderation_queue.status: pending → approved | rejected`; причины — `reject_reasons` (kk/ru), журнал — `moderation_log`.

## 4. Верификация пользователя

`verification_level`: 1 — телефон; 2 — ИИН/БИН (госсервис/ЭЦП, v2); 3 — документы хозяйства проверены; 4 — видео/выездная проверка. `trust_score` (0..100) считается из уровня, сделок, споров, жалоб, возраста аккаунта и отклонений — определяет премодерацию и лимиты (`accountLimits()`).
