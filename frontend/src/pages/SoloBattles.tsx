import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCharts, type ChartSummary } from "../lib/api";
import "./SoloBattles.css";
import "./pages.css";

function formatDuration(sec: number | null) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SoloBattles() {
  const [charts, setCharts] = useState<ChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchCharts();
        if (!cancelled) {
          setCharts(rows);
          setSelectedId(rows[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load charts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = charts.find((c) => c.id === selectedId) ?? null;

  return (
    <main className="page solo-page">
      <header className="page-head">
        <h1>Solo Battles</h1>
        <p>
          Practice against community maps from the library. Full scoring comes
          later — browse and preview for now.
        </p>
      </header>

      {loading && <p className="meta-sub">Loading charts…</p>}
      {error && (
        <p className="api-error">
          {error} — is the API running on :3001?
        </p>
      )}

      {!loading && !error && charts.length === 0 && (
        <div className="solo-empty">
          <p>No charts yet.</p>
          <Link to="/map" className="btn primary">
            Map one
          </Link>
        </div>
      )}

      {charts.length > 0 && (
        <section className="solo-layout">
          <ul className="solo-list">
            {charts.map((chart) => (
              <li key={chart.id}>
                <button
                  type="button"
                  className={
                    selectedId === chart.id ? "solo-card selected" : "solo-card"
                  }
                  onClick={() => setSelectedId(chart.id)}
                >
                  <span className="solo-card-title">{chart.title}</span>
                  <span className="solo-card-meta">
                    {chart.difficulty} · {formatDuration(chart.durationSec)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <aside className="solo-detail">
            {selected ? (
              <>
                <h2>{selected.title}</h2>
                <p className="meta-sub">
                  {selected.difficulty} · {formatDuration(selected.durationSec)} ·{" "}
                  {selected.model || "model n/a"}
                </p>

                {selected.videoUrl ? (
                  <video
                    className="solo-preview"
                    src={selected.videoUrl}
                    controls
                    playsInline
                    muted
                  />
                ) : (
                  <div className="solo-preview placeholder">No preview video</div>
                )}

                <div className="page-actions">
                  <button type="button" className="btn primary" disabled>
                    Start solo (soon)
                  </button>
                  <Link to="/map" className="btn ghost">
                    Map another
                  </Link>
                </div>
              </>
            ) : (
              <p className="hint">Select a chart to preview.</p>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
