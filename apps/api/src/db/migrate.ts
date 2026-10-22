/**
 * Простой SQL-мигратор: применяет файлы из ./migrations/*.sql по алфавиту, фиксирует в schema_migrations.
 * Команды: up | reset (DROP SCHEMA public CASCADE → up).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

async function main() {
  const cmd = process.argv[2] ?? "up";
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    if (cmd === "reset") {
      if (config.NODE_ENV === "production") throw new Error("reset запрещён в production");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      console.log("schema dropped");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      process.stdout.write(`applying ${f} … `);
      await client.query("BEGIN");
      try {
        await client.query(sql); // simple protocol: несколько statements в одном запросе
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log("ok");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
