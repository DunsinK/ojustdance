const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  ""
);

export function getApiUrl() {
  if (!API_URL) {
    throw new Error("VITE_API_URL is not set in frontend/.env");
  }
  return API_URL;
}

export type HealthResponse = {
  ok: boolean;
  service?: string;
  time?: string;
  supabaseConfigured?: boolean;
};

export type ChartSummary = {
  id: string;
  title: string;
  difficulty: string;
  durationSec: number | null;
  sampleRateHz?: number | null;
  model?: string | null;
  videoUrl: string | null;
  createdAt: string;
};

export type PublishChartResult = {
  id: string;
  title: string;
  difficulty: string;
  durationSec: number | null;
  videoUrl: string | null;
  createdAt: string;
};

export type ChartDetail = ChartSummary & {
  chartJson: unknown;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getApiUrl()}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json() as Promise<HealthResponse>;
}

export async function fetchCharts(): Promise<ChartSummary[]> {
  const res = await fetch(`${getApiUrl()}/charts`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load charts (${res.status})`);
  }
  const data = (await res.json()) as { charts: ChartSummary[] };
  return data.charts ?? [];
}

export async function fetchChart(id: string): Promise<ChartDetail> {
  const res = await fetch(`${getApiUrl()}/charts/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load chart (${res.status})`);
  }
  return res.json() as Promise<ChartDetail>;
}

export async function publishChart(opts: {
  chart: object;
  video?: Blob | null;
  title?: string;
  difficulty?: string;
  videoFilename?: string;
}): Promise<PublishChartResult> {
  const form = new FormData();
  // Send JSON as the already-supported chart file, avoiding multipart text-field limits
  // when durable thumbnail JPEGs are embedded in the chart.
  form.append("chart", new Blob([JSON.stringify(opts.chart)], { type: "application/json" }), "chart.json");
  if (opts.title) form.append("title", opts.title);
  if (opts.difficulty) form.append("difficulty", opts.difficulty);
  if (opts.video) {
    const name = opts.videoFilename || "preview.webm";
    form.append("video", opts.video, name);
  }

  const res = await fetch(`${getApiUrl()}/charts`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Publish failed (${res.status})`);
  }

  return res.json() as Promise<PublishChartResult>;
}
