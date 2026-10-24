import { useState } from "react";
import { fetchHealth, getApiUrl, type HealthResponse } from "../lib/api";
import "./pages.css";

type Status = "idle" | "loading" | "ok" | "error";

export function ApiTest() {
  const [status, setStatus] = useState<Status>("idle");
  const [payload, setPayload] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  async function ping() {
    setStatus("loading");
    setError(null);
    setPayload(null);
    setLatencyMs(null);

    const started = performance.now();
    try {
      const data = await fetchHealth();
      setLatencyMs(Math.round(performance.now() - started));
      setPayload(data);
      setStatus(data.ok ? "ok" : "error");
      if (!data.ok) setError("Server returned ok: false");
    } catch (err) {
      setLatencyMs(Math.round(performance.now() - started));
      setStatus("error");
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  let apiBase = "(not set)";
  try {
    apiBase = getApiUrl();
  } catch {
    apiBase = "(VITE_API_URL missing — restart Vite after editing .env)";
  }

  return (
    <main className="page api-test">
      <header className="page-head">
        <h1>API test</h1>
        <p>Ping the Express health check from the browser.</p>
      </header>

      <section className="api-panel">
        <p className="meta-sub">
          Target: <code>{apiBase}/health</code>
        </p>

        <button
          type="button"
          className="btn primary"
          onClick={ping}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Pinging…" : "Ping /health"}
        </button>

        <dl className="api-stats">
          <div>
            <dt>Status</dt>
            <dd className={`api-status ${status}`}>{status}</dd>
          </div>
          <div>
            <dt>Latency</dt>
            <dd>{latencyMs == null ? "—" : `${latencyMs} ms`}</dd>
          </div>
        </dl>

        {error && <p className="api-error">{error}</p>}

        {payload && (
          <pre className="api-json">{JSON.stringify(payload, null, 2)}</pre>
        )}
      </section>
    </main>
  );
}
