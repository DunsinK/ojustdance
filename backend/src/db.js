import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!config.databaseUrl) {
    throw new Error("SUPABASE_DIRECT_CONNECTION_KEY is not set in backend/.env");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
