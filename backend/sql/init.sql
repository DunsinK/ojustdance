-- Run once in Supabase SQL editor if auto-migrate fails.
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

create index if not exists charts_created_at_idx on public.charts (created_at desc);
