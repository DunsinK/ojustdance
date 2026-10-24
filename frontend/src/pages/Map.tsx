import { useEffect, useState } from "react";
import "./pages.css";

export function Map() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;

    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [recording]);

  function toggleRecord() {
    if (recording) {
      setRecording(false);
      return;
    }
    setSeconds(0);
    setRecording(true);
  }

  return (
    <main className="page map-page">
      <header className="page-head">
        <h1>Map</h1>
        <p>Record a pose chart timed to a song — like osu! mapping for bodies.</p>
      </header>

      <section className="map-layout">
        <div className="map-stage">
          <div className="cam-slot tall">
            {recording ? "Recording pose…" : "Preview camera"}
          </div>
          <div className="map-controls">
            <button
              type="button"
              className={recording ? "btn danger" : "btn primary"}
              onClick={toggleRecord}
            >
              {recording ? "Stop" : "Start map"}
            </button>
            <p className="meta-sub">
              {recording
                ? `Capturing… ${seconds}s (mock)`
                : seconds > 0
                  ? `Last take: ${seconds}s — export wiring later`
                  : "No take yet"}
            </p>
          </div>
        </div>

        <aside className="map-side">
          <h2>Chart draft</h2>
          <label className="field">
            Song title
            <input type="text" placeholder="Midnight Groove" disabled />
          </label>
          <label className="field">
            Difficulty
            <select disabled defaultValue="easy">
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <p className="hint">
            Relative landmarks + timestamps will land here as JSON once MediaPipe
            is wired in.
          </p>
          <button type="button" className="btn ghost" disabled>
            Save to library
          </button>
        </aside>
      </section>
    </main>
  );
}
