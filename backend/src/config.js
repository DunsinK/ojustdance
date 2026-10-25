function env(name, fallback = "") {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return String(value).trim();
}

/**
 * Supabase UI sometimes shows passwords as [secret].
 * Also URL-encode so characters like ! work in the connection string.
 */
export function normalizeDatabaseUrl(raw) {
  if (!raw) return "";
  let url = raw.trim();
  url = url.replace(/:\[([^\]]+)\]@/, (_, pass) => `:${encodeURIComponent(pass)}@`);
  return url;
}

/** Default 500 MB — override with MAX_VIDEO_UPLOAD_MB in .env */
const maxVideoMb = Number(env("MAX_VIDEO_UPLOAD_MB", "500"));

/** Comma-separated FRONTEND_ORIGIN list. Trailing slashes stripped (Origin never has them). */
function parseOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const frontendOrigins = parseOrigins(
  env("FRONTEND_ORIGIN", "http://localhost:5173")
);

export const config = {
  port: Number(env("PORT", "3001")),
  /** @deprecated Prefer frontendOrigins — kept as first allowed origin for logs */
  frontendOrigin: frontendOrigins[0] || "http://localhost:5173",
  frontendOrigins,
  supabaseUrl: env("SUPABASE_URL"),
  supabaseSecretKey: env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
  databaseUrl: normalizeDatabaseUrl(env("SUPABASE_DIRECT_CONNECTION_KEY")),
  storageBucket: env("SUPABASE_CHART_BUCKET", "chart-videos"),
  maxVideoBytes: Math.max(1, maxVideoMb) * 1024 * 1024,
  museApiKey: env("MUSE_API_KEY"),
  museModel: env("MUSE_MODEL", "muse-spark-1.3"),
  museBaseUrl: env("MUSE_BASE_URL", "https://api.meta.ai/v1"),
};
