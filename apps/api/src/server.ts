import { buildApp } from "./app.js";
import { config } from "./config.js";
import { startJobs } from "./jobs/runner.js";

const app = await buildApp();
try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`MalSatu API on http://${config.HOST}:${config.PORT} (docs: /docs)`);
  if (process.env.JOBS_INLINE !== "false") startJobs(app.log);
} catch (e) { app.log.error(e); process.exit(1); }

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, async () => { await app.close(); process.exit(0); });
