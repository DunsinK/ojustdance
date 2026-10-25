import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

function displayTitle(title: string | null | undefined) {
  const t = (title || "").trim();
  if (!t || /^untitled chart$/i.test(t)) return "Untitled dance";
  return t;
}

type Phase = "browse" | "loading" | "play";

export function SoloBattles() {
  const [searchParams] = useSearchParams();
  const danceParam = searchParams.get("dance");
  const autoStarted = useRef(false);

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
          const preferred =
            (danceParam && rows.some((r) => r.id === danceParam)
              ? danceParam
              : null) ||
            rows[0]?.id ||
            null;
          setSelectedId(preferred);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dances");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [danceParam]);

  const selected = charts.find((c) => c.id === selectedId) ?? null;

  async function startSolo(id = selectedId) {
    if (!id) return;
    setSelectedId(id);
    setPhase("loading");
    setLoadError(null);
    setLastResult(null);
    try {
      const detail = await fetchChart(id);
      const doc = parseChartDocument(detail.chartJson);
      if (detail.title) doc.title = detail.title;
      setActiveChart(doc);
      setActiveVideoUrl(detail.videoUrl);
      setPhase("play");
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "Could not start dance");
      setPhase("browse");
    }
  }

  useEffect(() => {
    if (!danceParam || loading || error || autoStarted.current) return;
    if (!charts.some((c) => c.id === danceParam)) return;
    autoStarted.current = true;
    void startSolo(danceParam);
  }, [danceParam, loading, error, charts]);

  function exitMatch() {
    setPhase("browse");
    setActiveChart(null);
    setActiveVideoUrl(null);
  }

  if (phase === "play" && activeChart) {
    return (
      <main className="page solo-page play-session">
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
      <header className="solo-head">
        <div>
          <span className="solo-kicker">Practice · One player</span>
          <h1>Solo</h1>
          <p>
            Pick a dance, match the moves on camera, and climb your score — no
            opponent needed.
          </p>
        </div>
        <div className="solo-head-actions">
          <Link to="/dances" className="btn ghost">
            Browse dances
          </Link>
          <Link to="/map" className="btn ghost">
            Map yours
          </Link>
        </div>
      </header>

      {loading && <p className="solo-status">Loading dances…</p>}
      {error && <p className="api-error">{error}</p>}
      {loadError && <p className="api-error">{loadError}</p>}

      {lastResult && phase === "browse" && (
        <div className="solo-last-result" role="status">
          <strong>Last run · {lastResult.score.toLocaleString()} pts</strong>
          <span>Max combo {lastResult.maxCombo}</span>
          <span>{Math.round(lastResult.avgAccuracy * 100)}% match</span>
        </div>
      )}

      {!loading && !error && charts.length === 0 && (
        <div className="solo-empty">
          <p>No dances in the library yet.</p>
          <Link to="/map" className="btn primary">
            Map one
          </Link>
        </div>
      )}

      {charts.length > 0 && (
        <section className="solo-layout">
          <div className="solo-stage">
            {selected ? (
              <>
                <div className="solo-stage-top">
                  <div>
                    <h2>{displayTitle(selected.title)}</h2>
                    <div className="solo-stage-meta">
                      <span className="solo-chip solo-chip--lime">
                        {formatDuration(selected.durationSec)}
                      </span>
                      <span className="solo-chip">
                        {selected.model || "lite"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="solo-preview-wrap">
                  {selected.videoUrl ? (
                    <video
                      className="solo-preview"
                      src={selected.videoUrl}
                      controls
                      playsInline
                      muted
                    />
                  ) : (
                    <div className="solo-preview placeholder">
                      No preview video
                    </div>
                  )}
                </div>

                <div className="solo-stage-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={phase === "loading"}
                    onClick={() => void startSolo()}
                  >
                    {phase === "loading" ? "Loading…" : "Start solo"}
                  </button>
                  <Link to="/battle" className="btn ghost">
                    Find a battle
                  </Link>
                </div>
              </>
            ) : (
              <div className="solo-preview placeholder" style={{ margin: "1rem" }}>
                Select a dance to preview
              </div>
            )}
          </div>

          <aside className="solo-rail">
            <p className="solo-rail-label">Your library</p>
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
                    <span className="solo-card-thumb" aria-hidden="true">
                      {chart.videoUrl ? (
                        <video
                          src={chart.videoUrl}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <span className="solo-card-thumb-fallback">Dance</span>
                      )}
                    </span>
                    <span className="solo-card-copy">
                      <span className="solo-card-title">
                        {displayTitle(chart.title)}
                      </span>
                      <span className="solo-card-meta">
                        {formatDuration(chart.durationSec)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      )}
    </main>
  );
}
