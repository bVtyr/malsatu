import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { config } from "../config.js";
import type { Database } from "./types.js";

// bigint → number (суммы в тенге укладываются в Number.MAX_SAFE_INTEGER)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 20 });
export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
export type DB = Kysely<Database>;
