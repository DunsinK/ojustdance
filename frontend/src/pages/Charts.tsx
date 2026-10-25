import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchCharts, type ChartSummary } from "../lib/api";
import "./Charts.css";
import "./pages.css";

function formatDuration(sec: number | null) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Charts() {
  const navigate = useNavigate();
  const [dances, setDances] = useState<ChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchCharts();
        if (!cancelled) setDances(rows);
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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dances;
    return dances.filter((d) => {
      const hay = `${d.title} ${d.difficulty} ${d.model ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dances, query]);

  function playSolo(id: string) {
    navigate(`/solo?dance=${encodeURIComponent(id)}`);
  }

  return (
    <main className="page dances-page">
      <header className="dances-head">
        <div>
          <span className="dances-kicker">For you</span>
          <h1>Dances</h1>
          <p>Browse community routines. Tap one and take it Solo.</p>
        </div>
        <Link to="/map" className="btn ghost dances-map-btn">
          Map yours
        </Link>
      </header>

      <label className="dances-search">
        <span className="sr-only">Search dances</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dances"
          autoComplete="off"
        />
      </label>

      {loading && <p className="dances-status">Loading dances…</p>}
      {error && <p className="api-error">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <div className="dances-empty">
          <p>{dances.length ? "No matches." : "No dances yet."}</p>
          <Link to="/map" className="btn primary">
            Map one
          </Link>
        </div>
      )}

      <div className="dances-feed" role="list">
        {filtered.map((dance) => (
          <article key={dance.id} className="dance-card" role="listitem">
            <div className="dance-card-media">
              {dance.videoUrl ? (
                <video
                  src={dance.videoUrl}
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  onMouseEnter={(e) => {
                    void e.currentTarget.play().catch(() => undefined);
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.pause();
                    e.currentTarget.currentTime = 0;
                  }}
                />
              ) : (
                <div className="dance-card-placeholder">No preview</div>
              )}
              <span className="dance-card-diff">{dance.difficulty}</span>
            </div>

            <div className="dance-card-body">
              <h2>{dance.title || "Untitled dance"}</h2>
              <p>{formatDuration(dance.durationSec)} · ready to solo</p>
              <button
                type="button"
                className="btn primary dance-card-cta"
                onClick={() => playSolo(dance.id)}
              >
                Pick for Solo
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
