import { useState } from "react";
import { Link } from "react-router-dom";
import "./pages.css";

type Phase = "idle" | "searching" | "live" | "result";

export function Battle() {
  const [phase, setPhase] = useState<Phase>("idle");

  return (
    <main className="page battle">
      <header className="page-head">
        <h1>Battle</h1>
        <p>Random opponent. Same chart. Highest score wins.</p>
      </header>

      <section className="arena" aria-live="polite">
        <div className="lane-panel you">
          <p className="lane-label">You</p>
          <div className="cam-slot">Camera feed</div>
          <p className="score">{phase === "idle" ? "—" : "12,480"}</p>
        </div>

        <div className="match-meta">
          {phase === "idle" && (
            <>
              <p className="meta-title">Ready when you are</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => setPhase("searching")}
              >
                Queue up
              </button>
            </>
          )}
          {phase === "searching" && (
            <>
              <p className="meta-title searching">Finding rival…</p>
              <p className="meta-sub">UI only — matchmaking comes later</p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPhase("live")}
              >
                Simulate match found
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPhase("idle")}
              >
                Cancel
              </button>
            </>
          )}
          {phase === "live" && (
            <>
              <p className="chart-name">Midnight Groove — Easy</p>
              <p className="meta-sub">2:14 remaining · mock timer</p>
              <div className="bar-track" aria-hidden="true">
                <span className="bar you-bar" style={{ width: "62%" }} />
                <span className="bar rival-bar" style={{ width: "54%" }} />
              </div>
              <button
                type="button"
                className="btn danger"
                onClick={() => setPhase("result")}
              >
                End match (mock)
              </button>
            </>
          )}
          {phase === "result" && (
            <>
              <p className="meta-title">You win</p>
              <p className="meta-sub">12,480 — 11,090</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => setPhase("searching")}
              >
                Rematch
              </button>
              <Link to="/charts" className="btn ghost">
                Pick another chart
              </Link>
            </>
          )}
        </div>

        <div className="lane-panel rival">
          <p className="lane-label">Rival</p>
          <div className="cam-slot dim">Waiting</div>
          <p className="score">{phase === "idle" || phase === "searching" ? "—" : "11,090"}</p>
        </div>
      </section>
    </main>
  );
}
