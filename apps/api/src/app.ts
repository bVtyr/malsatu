import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config, isDev } from "./config.js";
import authPlugin from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/errors.js";
import authRoutes from "./modules/auth/routes.js";
import regionsRoutes from "./modules/regions/routes.js";
import categoriesRoutes from "./modules/categories/routes.js";
import mediaRoutes from "./modules/media/routes.js";
import listingsRoutes from "./modules/listings/routes.js";
import favoritesRoutes from "./modules/favorites/routes.js";
import chatRoutes from "./modules/chat/routes.js";
import offersRoutes from "./modules/offers/routes.js";
import callsRoutes from "./modules/calls/routes.js";
import reportsRoutes from "./modules/reports/routes.js";
import moderationRoutes from "./modules/moderation/routes.js";
import adminRoutes from "./modules/admin/routes.js";
import notificationsRoutes from "./modules/notifications/routes.js";
import dealsRoutes from "./modules/deals/routes.js";
import priceIndexRoutes from "./modules/price-index/routes.js";
import cmsRoutes from "./modules/cms/routes.js";
import poolsRoutes from "./modules/pools/routes.js";
import transportRoutes from "./modules/transport/routes.js";
import vetRoutes from "./modules/vet/routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers[\"x-webhook-secret\"]"], censor: "[redacted]" },
      serializers: { req(req: any) { return { method: req.method, url: String(req.url).replace(/([?&]token=)[^&]+/, "$1[redacted]"), ip: req.ip }; } },
    },
    trustProxy: Number(process.env.TRUST_PROXY_HOPS ?? 1), bodyLimit: 5 * 1024 * 1024, // доверяем только ближайшему прокси: X-Forwarded-For нельзя подделать
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, { origin: isDev ? [config.PUBLIC_WEB_URL, "http://localhost:3000", "http://127.0.0.1:3000"] : [config.PUBLIC_WEB_URL], credentials: true });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute", hook: "preHandler", keyGenerator: (req) => req.user?.id ?? req.ip });
  await app.register(websocket);
  await app.register(multipart);
  if (isDev) {
    await app.register(swagger, { openapi: { info: { title: "MalSatu API", version: "0.1.0", description: "Маркетплейс живого скота, мяса и услуг (Казахстан)" } } });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }
  await app.register(authPlugin);
  registerErrorHandler(app);

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  await app.register(async (api) => {
    await api.register(authRoutes); await api.register(regionsRoutes); await api.register(categoriesRoutes); await api.register(mediaRoutes);
    await api.register(listingsRoutes); await api.register(favoritesRoutes); await api.register(chatRoutes); await api.register(offersRoutes);
    await api.register(callsRoutes); await api.register(reportsRoutes); await api.register(moderationRoutes); await api.register(adminRoutes);
    await api.register(notificationsRoutes); await api.register(dealsRoutes); await api.register(priceIndexRoutes); await api.register(cmsRoutes);
    await api.register(poolsRoutes); await api.register(transportRoutes); await api.register(vetRoutes);
  }, { prefix: "/api/v1" });

  return app;
}
