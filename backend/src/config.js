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

export const config = {
  port: Number(env("PORT", "3001")),
  frontendOrigin: env("FRONTEND_ORIGIN", "http://localhost:5173"),
  supabaseUrl: env("SUPABASE_URL"),
  supabaseSecretKey: env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
  databaseUrl: normalizeDatabaseUrl(env("SUPABASE_DIRECT_CONNECTION_KEY")),
  storageBucket: env("SUPABASE_CHART_BUCKET", "chart-videos"),
};
