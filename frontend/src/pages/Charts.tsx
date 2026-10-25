import { useEffect, useMemo, useRef, useState } from "react";
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

type ViewMode = "feed" | "library";

export function Charts() {
  const navigate = useNavigate();
  const [dances, setDances] = useState<ChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("feed");
  const [activeId, setActiveId] = useState<string | null>(null);
  const slideRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchCharts();
        if (!cancelled) {
          setDances(rows);
          setActiveId(rows[0]?.id ?? null);
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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dances;
    return dances.filter((d) => {
      const hay = `${d.title} ${d.model ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dances, query]);

  // Autoplay the slide in view; pause the rest (feed only).
  useEffect(() => {
    if (view !== "feed" || !dances.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.danceId;
          if (!id) continue;
          const video = entry.target.querySelector("video");
          if (!(video instanceof HTMLVideoElement)) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            setActiveId(id);
            void video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        }
      },
      { threshold: [0.35, 0.65, 0.9] }
    );

    for (const el of slideRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [view, dances]);

  function playSolo(id: string) {
    navigate(`/solo?dance=${encodeURIComponent(id)}`);
  }

  function setSlideRef(id: string, el: HTMLElement | null) {
    if (el) slideRefs.current.set(id, el);
    else slideRefs.current.delete(id);
  }

  return (
    <main
      className={
        view === "feed" ? "page dances-page dances-page--feed" : "page dances-page"
      }
    >
      {view === "feed" ? (
        <>
          {loading && <p className="dances-status dances-status--feed">Loading dances…</p>}
          {error && <p className="api-error dances-status--feed">{error}</p>}

          {!loading && !error && dances.length === 0 && (
            <div className="dances-empty dances-empty--feed">
              <p>No dances yet.</p>
              <Link to="/map" className="btn primary">
                Map one
              </Link>
            </div>
          )}

          <div className="dances-snap" aria-label="For you feed">
            {dances.map((dance, index) => (
              <section
                key={dance.id}
                className={
                  activeId === dance.id
                    ? "dances-slide is-active"
                    : "dances-slide"
                }
                data-dance-id={dance.id}
                ref={(el) => setSlideRef(dance.id, el)}
                aria-label={`${dance.title || "Untitled dance"}, ${index + 1} of ${dances.length}`}
              >
                <div className="dances-slide-row">
                  <div className="dances-player">
                    <div className="dances-slide-media">
                      {dance.videoUrl ? (
                        <video
                          src={dance.videoUrl}
                          muted
                          playsInline
                          loop
                          preload={index < 2 ? "auto" : "metadata"}
                        />
                      ) : (
                        <div className="dances-slide-placeholder">No preview</div>
                      )}
                      <div className="dances-slide-wash" aria-hidden="true" />
                    </div>

                    <div className="dances-slide-meta">
                      <span className="dances-slide-kicker">For you</span>
                      <h2>{dance.title || "Untitled dance"}</h2>
                      <p>{formatDuration(dance.durationSec)} · swipe for more</p>
                      <button
                        type="button"
                        className="btn primary dances-slide-cta"
                        onClick={() => playSolo(dance.id)}
                      >
                        Dance Solo
                      </button>
                    </div>
                  </div>

                  <div className="dances-feed-rail" aria-label="Dances actions">
                    <button
                      type="button"
                      className="dances-rail-btn"
                      onClick={() => setView("library")}
                      aria-label="Open library"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect
                          x="3.5"
                          y="3.5"
                          width="7"
                          height="7"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <rect
                          x="13.5"
                          y="3.5"
                          width="7"
                          height="7"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <rect
                          x="3.5"
                          y="13.5"
                          width="7"
                          height="7"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <rect
                          x="13.5"
                          y="13.5"
                          width="7"
                          height="7"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                      </svg>
                      <span>Library</span>
                    </button>
                    <Link to="/map" className="dances-rail-btn dances-rail-btn--ghost">
                      <span>Map</span>
                    </Link>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <header className="dances-head">
            <div>
              <span className="dances-kicker">All routines</span>
              <h1>Library</h1>
              <p>Every mapped dance in one place.</p>
            </div>
            <div className="dances-head-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => setView("feed")}
              >
                For you
              </button>
              <Link to="/map" className="btn ghost dances-map-btn">
                Map yours
              </Link>
            </div>
          </header>

          <label className="dances-search">
            <span className="sr-only">Search dances</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="11"
                cy="11"
                r="6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M16.5 16.5 21 21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
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

          <div className="dances-grid" role="list">
            {filtered.map((dance) => (
              <article key={dance.id} className="dance-card" role="listitem">
                <button
                  type="button"
                  className="dance-card-hit"
                  onClick={() => playSolo(dance.id)}
                >
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
                  </div>
                  <div className="dance-card-body">
                    <h2>{dance.title || "Untitled dance"}</h2>
                    <p>{formatDuration(dance.durationSec)} · Solo</p>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
