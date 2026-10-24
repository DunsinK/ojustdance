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

export async function ensureChartsTable() {
  const db = getPool();
  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists public.charts (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      difficulty text not null default 'easy',
      duration_sec double precision,
      sample_rate_hz double precision,
      model text,
      chart_json jsonb not null,
      video_path text,
      video_url text,
      created_at timestamptz not null default now()
    );

    create index if not exists charts_created_at_idx
      on public.charts (created_at desc);
  `);
}
