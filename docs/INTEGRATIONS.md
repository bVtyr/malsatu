# Внешние интеграции

Все внешние системы спрятаны за интерфейсами в `apps/api/src/services/*` с `mock`-реализациями, чтобы разработка и тесты шли без ключей. Переключение — переменными окружения (`.env.example`).

| Область | Интерфейс / файл | Провайдеры (рекомендации для РК) | Переменные |
|---|---|---|---|
| SMS / мессенджеры (OTP, уведомления) | `SmsProvider` — `services/sms.ts` | smsc.kz, Mobizon, Kazinfoteh; WhatsApp Business API / Telegram-бот для канала `whatsapp`/`telegram` | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER` |
| Подменные номера (звонки без раскрытия телефона) | `CallMaskingProvider` — `services/calls.ts` + webhook `/webhooks/calls` | Zadarma (callback/виртуальные номера РК), Twilio Proxy; альтернатива — Beeline/Kcell API | `CALL_MASKING_PROVIDER`, `CALL_MASKING_API_KEY` |
| Платежи (v2): карты, Kaspi QR, рассрочка, счета для юрлиц | `PaymentProvider` — `services/payments.ts` (`createPayment`, `refund`, `verifyWebhook`) | Kaspi Pay, PayBox (Freedom Pay), CloudPayments KZ; выплаты продавцам — через эквайера/банк-партнёр (массовые выплаты на карты/IBAN) | `PAYMENT_PROVIDER`, `PAYMENT_MERCHANT_ID`, `PAYMENT_SECRET` |
| Хранилище медиа | `services/storage.ts` (S3 API) | MinIO локально; в проде — объектное хранилище на территории РК (требование закона о ПДн): PS Cloud Services, Kazteleport, Yandex Cloud KZ | `S3_*` |
| Обработка изображений | `services/media-processing.ts` (sharp) | — (встроено: webp, водяной знак, превью, pHash) | — |
| Карты и геокодинг | web: Leaflet-тайлы; API: PostGIS | OSM-тайлы (dev) → коммерческие: 2GIS, Yandex Maps API (JS + геокодер), MapTiler | `MAP_TILES_URL`, `GEOCODER_PROVIDER` |
| Справочник регионов | `shared/data/regions.ts` → таблица `regions` | импорт полного КАТО (data.egov.kz) скриптом; админ-CRUD `/admin/regions/:code` | — |
| Верификация ИИН/БИН (уровень 2) | `GOV_VERIFY_PROVIDER` (адаптер в v2) | eGov mobile / ЭЦП НУЦ РК (подпись челленджа), либо сервисы ГБД ФЛ/ЮЛ через шлюз ШЭП (нужен договор) | `GOV_VERIFY_PROVIDER`, `GOV_VERIFY_API_KEY` |
| База идентификации сельхозживотных (сверка бирок ИНЖ) | `ANIMAL_ID_DB_PROVIDER` (адаптер в v2); ручная проверка модератором/ветеринаром уже есть | ИСЖ (Минсельхоз РК) — доступ по соглашению | `ANIMAL_ID_DB_PROVIDER` |
| Карантинные зоны из официального источника | импорт в `quarantine_zones` (поле `source`) | Комитет ветеринарного контроля МСХ РК (бюллетени), при наличии API — job-импорт | — |
| Автоперевод kk↔ru | `Translator` — `services/translate.ts` | DeepL (kk поддерживается), Google Translate, Yandex Translate | `TRANSLATE_PROVIDER`, `TRANSLATE_API_KEY` |
| Голосовой ввод | web: Web Speech API (`kk-KZ`, `ru-RU`) | серверный fallback — Yandex SpeechKit / Google STT (не реализован) | — |
| Push-уведомления | `services/notifications.ts` (web-push) | VAPID-ключи (`npx web-push generate-vapid-keys`); для нативных оболочек — FCM | `VAPID_*` |
| Email | канал `email` в `deliver()` (заглушка) | SendGrid / Mailgun / SMTP | — |
| Антибот / CAPTCHA | rate-limit есть; CAPTCHA на OTP — опционально | hCaptcha / Cloudflare Turnstile | — |
| Мониторинг и ошибки | pino + `/health`, `SENTRY_DSN` | Sentry, Grafana/Prometheus (экспортер Fastify), UptimeRobot | `SENTRY_DSN`, `LOG_LEVEL` |
| Продуктовая аналитика | `analytics_events` + `/admin/dashboard` воронка | опционально экспорт в Metabase/Yandex Metrica | — |
| Резервное копирование | — | `pg_dump` по cron + WAL-G в S3; версионирование бакета; тест восстановления раз в месяц | — |
| Юридические документы | `cms_pages` kind=`legal` (terms, escrow-offer, privacy, listing-rules, refunds) | тексты готовит юрист; размещаются через `/admin/cms/:slug` | — |

## Порядок подключения для запуска в прод

1. Домен + TLS, объектное хранилище в РК, управляемый PostgreSQL с PostGIS, Redis.
2. SMS-шлюз (OTP) — без него вход невозможен; `OTP_DEV_STATIC_CODE` удалить.
3. Тайлы карт (коммерческая лицензия при трафике) + геокодер для «определить регион».
4. Подменные номера (телефония) — иначе кнопка «Позвонить» показывает mock-номер.
5. VAPID-ключи для push; Telegram/WhatsApp — по желанию.
6. v2: платёжный партнёр (escrow требует юрлица-оператора платежей или агентской схемы с банком), госверификация, ИСЖ.
