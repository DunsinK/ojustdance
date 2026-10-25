import { getPool } from "./db.js";
import { getSupabase } from "./supabase.js";

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    difficulty: row.difficulty,
    duration_sec: row.duration_sec ?? row.durationSec,
    sample_rate_hz: row.sample_rate_hz ?? row.sampleRateHz,
    model: row.model,
    chart_json: row.chart_json ?? row.chartJson,
    video_path: row.video_path ?? row.videoPath,
    video_url: row.video_url ?? row.videoUrl,
    created_at: row.created_at ?? row.createdAt,
  };
}

function missingTableHint(err) {
  const msg = err?.message || String(err);
  if (/Could not find the table|relation .*charts.* does not exist/i.test(msg)) {
    return new Error(
      "Table public.charts is missing. Run backend/sql/init.sql in the Supabase SQL editor, then retry."
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function withPgFallback(label, supabaseFn, pgFn) {
  try {
    return await supabaseFn();
  } catch (err) {
    const hint = missingTableHint(err);
    if (hint !== err) throw hint;
    console.warn(`${label} via Supabase failed, trying direct SQL:`, err.message);
    try {
      return await pgFn();
    } catch (pgErr) {
      throw missingTableHint(pgErr);
    }
  }
}

/** Insert via Supabase REST (preferred); fall back to direct Postgres. */
export async function insertChart(row) {
  return withPgFallback(
    "insertChart",
    async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("charts")
        .insert({
          title: row.title,
          difficulty: row.difficulty,
          duration_sec: row.durationSec,
          sample_rate_hz: row.sampleRateHz,
          model: row.model,
          chart_json: row.chartJson,
          video_path: row.videoPath,
          video_url: row.videoUrl,
        })
        .select(
          "id, title, difficulty, duration_sec, sample_rate_hz, model, video_path, video_url, created_at"
        )
        .single();
      if (error) throw error;
      return mapRow(data);
    },
    async () => {
      const db = getPool();
      const result = await db.query(
        `insert into public.charts
          (title, difficulty, duration_sec, sample_rate_hz, model, chart_json, video_path, video_url)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         returning id, title, difficulty, duration_sec, sample_rate_hz, model,
                   video_path, video_url, created_at`,
        [
          row.title,
          row.difficulty,
          row.durationSec,
          row.sampleRateHz,
          row.model,
          JSON.stringify(row.chartJson),
          row.videoPath,
          row.videoUrl,
        ]
      );
      return result.rows[0];
    }
  );
}

export async function listCharts() {
  return withPgFallback(
    "listCharts",
    async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("charts")
        .select(
          "id, title, difficulty, duration_sec, sample_rate_hz, model, video_path, video_url, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    async () => {
      const db = getPool();
      const result = await db.query(
        `select id, title, difficulty, duration_sec, sample_rate_hz, model,
                video_path, video_url, created_at
         from public.charts
         order by created_at desc
         limit 100`
      );
      return result.rows;
    }
  );
}

export async function getChartById(id) {
  return withPgFallback(
    "getChartById",
    async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("charts")
        .select(
          "id, title, difficulty, duration_sec, sample_rate_hz, model, chart_json, video_path, video_url, created_at"
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : null;
    },
    async () => {
      const db = getPool();
      const result = await db.query(
        `select id, title, difficulty, duration_sec, sample_rate_hz, model,
                chart_json, video_path, video_url, created_at
         from public.charts
         where id = $1`,
        [id]
      );
      return result.rows[0] ?? null;
    }
  );
}
