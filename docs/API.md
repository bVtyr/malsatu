# API (кратко)

База: `/api/v1`. Авторизация: `Authorization: Bearer <token>`. Swagger UI: `/docs`. Ошибки: `{ "error": { "code": "...", "details": ... } }`. WebSocket: `/api/v1/ws?token=…` (события `message`, `typing`, `offer`, `deal`).

| Группа | Эндпоинты |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/logout`, `GET /auth/me`, `PATCH /users/me`, `DELETE /users/me`, `GET /users/me/export`, `GET /users/:id` |
| Справочники | `GET /regions?parent=&level=`, `GET /regions/resolve?lat&lng`, `GET /regions/:code`, `GET /categories`, `GET /categories/:code`, `GET /breeds?species=`, `GET /document-types`, `GET /reject-reasons` |
| Медиа | `GET /media/:id`, `POST /media/presign`, `POST /media/:id/complete`, `POST /media/upload` (multipart) |
| Объявления | `GET /listings` (все фильтры из `ListingSearchSchema`), `GET /listings/map?zoom&bbox`, `GET /listings/price-hint`, `GET /listings/yield`, `GET /listings/:id`, `GET /listings/:id/similar`, `POST /listings`, `PUT /listings/:id`, `POST /listings/:id/publish`, `POST /listings/:id/status`, `POST /listings/:id/extend`, `DELETE /listings/:id`, `POST /listings/:id/documents`, `POST /listings/bulk`, `GET /listings/:id/stats`, `GET /users/me/listings` |
| Избранное и др. | `GET/POST/DELETE /favorites/:id`, `GET /history`, `GET/POST/DELETE /compare/:id`, `GET/POST/DELETE /saved-searches` |
| Чат | `GET /conversations`, `POST /conversations`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/block`, `GET/PUT /quick-replies` |
| Офферы | `POST /offers`, `GET /offers`, `POST /offers/:id` (accept/reject/counter/withdraw) |
| Звонки | `POST /listings/:id/call`, `POST /webhooks/calls` |
| Жалобы | `POST /reports` |
| Модерация | `GET /moderation/queue`, `POST /moderation/queue/:id/decide`, `POST /moderation/documents/:id/verify`, `POST /moderation/tags/:id/verify`, `GET /moderation/reports`, `POST /moderation/reports/:id/resolve`, `GET /moderation/log` |
| Сделки | `POST /deals`, `GET /deals?role=`, `GET /deals/:id`, `POST /deals/:id/pay`, `POST /deals/:id/action`, `POST /deals/:id/review`, `POST /reviews/:id/reply`, `GET /disputes`, `POST /disputes/:id/messages`, `POST /disputes/:id/resolve` |
| Платежи | `POST /payments/webhook` (подпись `x-signature` = HMAC-SHA256 сырого тела; идемпотентно), `GET /payments/:id` |
| Аукционы (v3) | `GET /auctions?status&region`, `GET /auctions/:id`, `POST /auctions` (владелец активного объявления, L≥2), `POST /auctions/:id/deposit`, `POST /auctions/:id/bid` (`amountKzt`, `maxAutoKzt`), `POST /auctions/:id/cancel` |
| Тендеры (v3) | `GET /tenders?status&region&category`, `GET /tenders/:id`, `POST /tenders` (L≥2), `POST /tenders/:id/bids` (одно на продавца, L≥2), `POST /tenders/:id/bids/withdraw`, `POST /tenders/:id/award` (`bidId`, `mode`) → сделка, если к предложению приложено объявление, `POST /tenders/:id/cancel` |
| Верификация | `GET /verification/me`, `POST /verification/requests` (`level` 2–4, `iinBin` с контрольной суммой, `documentMediaIds`), `GET /moderation/verification`, `POST /moderation/verification/:id/decide` |
| Служебные | `GET /health` (liveness), `GET /ready` (readiness: `SELECT 1` ≤ 2 с) |
| Индекс цен | `GET /price-index`, `GET /price-index/history`, `GET /price-index/compare` |
| Складчина | `GET /pools`, `GET /pools/:id`, `POST /pools`, `POST /pools/:id/reserve`, `POST /pools/:id/shares/:shareId/pay`, `POST /pools/:id/status`, `GET /users/me/pool-shares` |
| Перевозки | `GET /transport/estimate`, `GET/POST /transport/requests`, `GET/POST /transport/requests/:id/bids`, `POST /transport/requests/:id/choose`, `POST /transport/requests/:id/track`, `POST /transport/requests/:id/status`, `PUT /carrier/profile` |
| Ветеринар | `GET/POST /vet/requests`, `POST /vet/requests/:id/accept`, `POST /vet/requests/:id/report`, `PUT /vet/profile` |
| Уведомления | `GET /notifications`, `POST /notifications/read`, `GET/PUT /notifications/settings`, `POST /notifications/push-subscribe` |
| CMS/SEO | `GET /cms/pages`, `GET /cms/pages/:slug`, `GET /banners`, `GET /sitemap.xml` |
| Админ | `GET /admin/dashboard`, `GET/PATCH /admin/users`, `POST /admin/blacklist`, `PUT /admin/categories/:code`, `PATCH /admin/categories/:code/enabled`, `PUT /admin/regions/:code`, `PUT /admin/breeds/:code`, `PUT /admin/reject-reasons/:code`, `GET/POST/PATCH/DELETE /admin/quarantine-zones`, `GET/POST/DELETE /admin/commission-rules`, `PUT /admin/tariffs/:code`, `POST /admin/promo-codes`, `GET/PUT /admin/settings`, `PUT /admin/cms/:slug`, `POST /admin/banners`, `POST /admin/broadcast`, `GET /admin/audit`, `GET /admin/deals`, `GET /admin/payouts`, `POST /admin/payouts/:id/mark-paid` |
