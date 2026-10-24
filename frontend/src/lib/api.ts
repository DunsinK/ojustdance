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
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getApiUrl()}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json() as Promise<HealthResponse>;
}
