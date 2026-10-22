/**
 * Фоновые задачи. В MVP — setInterval внутри API-процесса (JOBS_INLINE=false выключает); для прода — отдельный процесс `pnpm jobs`
 * или BullMQ-очереди на Redis (адаптер легко заменить: каждая задача — чистая async-функция).
 */
import { sql } from "kysely";
import { db } from "../db/index.js";
import { expireListings } from "./expire-listings.js";
import { notifySavedSearches } from "./saved-search-notify.js";
import { buildPriceIndex } from "./price-index.js";
import { applyQuarantineZones } from "../modules/admin/quarantine.js";
import { autoConfirmDeals } from "./deals.js";
import { settlePoolDeadlines } from "../modules/pools/routes.js";
import { deliver } from "../services/notifications.js";

type Logger = { info: (o: any, m?: string) => void; error: (o: any, m?: string) => void };

const JOBS: Array<{ name: string; everyMs: number; run: () => Promise<unknown> }> = [
  { name: "expire-listings", everyMs: 10 * 60_000, run: expireListings },
  { name: "saved-search-notify", everyMs: 15 * 60_000, run: notifySavedSearches },
  { name: "price-index", everyMs: 60 * 60_000, run: buildPriceIndex },
  { name: "quarantine-apply", everyMs: 30 * 60_000, run: applyQuarantineZones },
  { name: "deals-auto-confirm", everyMs: 5 * 60_000, run: autoConfirmDeals },
  { name: "pool-deadlines", everyMs: 10 * 60_000, run: () => settlePoolDeadlines() },
  { name: "offers-expire", everyMs: 10 * 60_000, run: () => db.updateTable("offers").set({ status: "expired" }).where("status", "=", "pending").where("expires_at", "<", new Date()).execute() },
  { name: "otp-cleanup", everyMs: 60 * 60_000, run: () => sql`DELETE FROM otp_codes WHERE created_at < now() - interval '1 day'`.execute(db) },
  { name: "notifications-quiet-hours", everyMs: 5 * 60_000, run: async () => { const rows = await db.selectFrom("notifications").select("id").where("sent_at", "is", null).where("created_at", "<", new Date(Date.now() - 60_000)).limit(500).execute(); for (const r of rows) await deliver(r.id); } },
];

export function startJobs(log: Logger) {
  for (const j of JOBS) {
    const tick = async () => { try { const r = await j.run(); log.info({ job: j.name, result: r }, "job done"); } catch (e) { log.error({ job: j.name, err: e }, "job failed"); } };
    setTimeout(tick, 15_000 + Math.random() * 10_000);
    setInterval(tick, j.everyMs).unref();
  }
  log.info({ jobs: JOBS.map((j) => j.name) }, "jobs scheduled");
}

if (process.argv[1]?.endsWith("runner.ts") || process.argv[1]?.endsWith("runner.js")) {
  const name = process.argv[2];
  const run = async () => { for (const j of JOBS) if (!name || j.name === name) console.log(j.name, await j.run()); };
  if (name === "--loop") startJobs(console as any); else run().then(() => process.exit(0));
}
