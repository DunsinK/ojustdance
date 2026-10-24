import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

let client = null;

export function getSupabase() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SECRET_KEY are required for video storage"
    );
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function ensureChartBucket() {
  const supabase = getSupabase();
  const bucket = config.storageBucket;
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = buckets?.some((b) => b.name === bucket);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024,
      allowedMimeTypes: ["video/webm", "video/mp4", "video/quicktime", "video/*"],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

export async function uploadChartVideo(file) {
  const supabase = getSupabase();
  const bucket = config.storageBucket;
  const ext = file.originalname?.includes(".")
    ? file.originalname.split(".").pop()
    : file.mimetype?.includes("mp4")
      ? "mp4"
      : "webm";
  const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype || "video/webm",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}
