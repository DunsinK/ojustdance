import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LiveChartMatch,
  type LiveMatchResult,
} from "../components/LiveChartMatch";
import { fetchChart, fetchCharts, type ChartSummary } from "../lib/api";
import { parseChartDocument } from "../pose/parseChart";
import type { ChartDocument } from "../pose/types";
import "./SoloBattles.css";
import "./pages.css";

function formatDuration(sec: number | null) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Phase = "browse" | "loading" | "play";

export function SoloBattles() {
  const [charts, setCharts] = useState<ChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("browse");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<ChartDocument | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LiveMatchResult | null>(null);

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

  async function startSolo() {
    if (!selectedId) return;
    setPhase("loading");
    setLoadError(null);
    setLastResult(null);
    try {
      const detail = await fetchChart(selectedId);
      const doc = parseChartDocument(detail.chartJson);
      if (detail.title) doc.title = detail.title;
      setActiveChart(doc);
      setActiveVideoUrl(detail.videoUrl);
      setPhase("play");
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "Could not start chart");
      setPhase("browse");
    }
  }

  function exitMatch() {
    setPhase("browse");
    setActiveChart(null);
    setActiveVideoUrl(null);
  }

  if (phase === "play" && activeChart) {
    return (
      <main className="page solo-page">
        <LiveChartMatch
          mode="solo"
          chart={activeChart}
          videoUrl={activeVideoUrl}
          title={activeChart.title}
          onExit={exitMatch}
          onComplete={setLastResult}
        />
      </main>
    );
  }

  return (
    <main className="page solo-page">
      <header className="page-head">
        <h1>Solo Battles</h1>
        <p>
          Pick a mapped chart, dance along on camera, and watch your score climb
          when you match the moves.
        </p>
      </header>

      {loading && <p className="meta-sub">Loading charts…</p>}
      {error && (
        <p className="api-error">
          {error} — is the API running on :3001?
        </p>
      )}
      {loadError && <p className="api-error">{loadError}</p>}

      {lastResult && phase === "browse" && (
        <p className="solo-last-result">
          Last run: {lastResult.score.toLocaleString()} pts · max combo{" "}
          {lastResult.maxCombo} · {Math.round(lastResult.avgAccuracy * 100)}%
          match
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
                  <button
                    type="button"
                    className="btn primary"
                    disabled={phase === "loading"}
                    onClick={() => void startSolo()}
                  >
                    {phase === "loading" ? "Loading…" : "Start solo"}
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
