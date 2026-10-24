import { useEffect, useRef, useState } from "react";
import { Timeline } from "../components/Timeline";
import {
  buildChartDocument,
  closeGaps,
  downloadChartJson,
  timelineDuration,
} from "../pose/exportChart";
import { PoseStage } from "../pose/PoseStage";
import type { ModelKey, TimelineSegment } from "../pose/types";
import { usePoseCamera } from "../pose/usePoseCamera";
import "./Map.css";
import "./pages.css";

const SAMPLE_HZ = 15;
const SAMPLE_INTERVAL_MS = 1000 / SAMPLE_HZ;

type Transport = "idle" | "recording" | "paused";

function newId() {
  return crypto.randomUUID();
}

export function Map() {
  const [cameraOn, setCameraOn] = useState(false);
  const [transport, setTransport] = useState<Transport>("idle");
  const [segments, setSegments] = useState<TimelineSegment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] =
    useState<"easy" | "normal" | "hard">("easy");
  const [model, setModel] = useState<ModelKey>("lite");

  const transportRef = useRef(transport);
  const playheadRef = useRef(playheadSec);
  const activeSegIdRef = useRef<string | null>(null);
  const recordStartedAtRef = useRef(0);
  const segmentOriginRef = useRef(0);
  const lastSampleAtRef = useRef(0);
  const clockRafRef = useRef(0);

  transportRef.current = transport;
  playheadRef.current = playheadSec;

  const { videoRef, canvasRef, ready, error, fps, hasPose } = usePoseCamera({
    enabled: cameraOn,
    model,
    onFrame: (frame) => {
      if (transportRef.current !== "recording" || !frame.hasPose) return;
      const now = performance.now();
      if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
      lastSampleAtRef.current = now;

      const t =
        segmentOriginRef.current +
        (now - recordStartedAtRef.current) / 1000;

      const segId = activeSegIdRef.current;
      if (!segId) return;

      setSegments((prev) =>
        prev.map((seg) => {
          if (seg.id !== segId) return seg;
          return {
            ...seg,
            endSec: t,
            samples: [
              ...seg.samples,
              { t: Number(t.toFixed(4)), landmarks: frame.landmarks },
            ],
          };
        })
      );
    },
  });

  useEffect(() => {
    if (transport !== "recording") {
      cancelAnimationFrame(clockRafRef.current);
      return;
    }

    const tick = () => {
      const t =
        segmentOriginRef.current +
        (performance.now() - recordStartedAtRef.current) / 1000;
      setPlayheadSec(t);
      clockRafRef.current = requestAnimationFrame(tick);
    };
    clockRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(clockRafRef.current);
  }, [transport]);

  function startRecording() {
    const startAt = playheadRef.current;
    const id = newId();
    activeSegIdRef.current = id;
    segmentOriginRef.current = startAt;
    recordStartedAtRef.current = performance.now();
    lastSampleAtRef.current = 0;

    setSegments((prev) => [
      ...prev,
      { id, startSec: startAt, endSec: startAt, samples: [] },
    ]);
    setSelectedId(id);
    setTransport("recording");
  }

  function pauseRecording() {
    setTransport("paused");
    activeSegIdRef.current = null;
  }

  function stopSession() {
    setTransport("idle");
    activeSegIdRef.current = null;
  }

  function deleteSelected() {
    if (!selectedId || transport === "recording") return;
    setSegments((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }

  function handleCloseGaps() {
    if (transport === "recording") return;
    setSegments((prev) => closeGaps(prev));
    setPlayheadSec(0);
    setSelectedId(null);
  }

  function clearAll() {
    if (transport === "recording") return;
    setSegments([]);
    setSelectedId(null);
    setPlayheadSec(0);
    setTransport("idle");
  }

  function exportJson() {
    const doc = buildChartDocument({
      segments,
      title,
      difficulty,
      model,
      sampleRateHz: SAMPLE_HZ,
    });
    downloadChartJson(doc);
  }

  const duration = timelineDuration(segments);
  const sampleCount = segments.reduce((n, s) => n + s.samples.length, 0);
  const selected = segments.find((s) => s.id === selectedId);

  let status = "Enable camera to start mapping";
  if (error) status = error;
  else if (cameraOn && !ready) status = "Loading MediaPipe…";
  else if (ready && transport === "recording")
    status = hasPose ? "Recording pose" : "Recording — no body in frame";
  else if (ready) status = hasPose ? `Tracking · ${fps} FPS` : "Step into frame";

  return (
    <main className="page map-page">
      <header className="page-head">
        <h1>Map</h1>
        <p>
          Record pose clips on a timeline — pause, scrub, delete takes, then
          export a chart.
        </p>
      </header>

      <section className="map-editor">
        <div className="map-stage-col">
          {!cameraOn ? (
            <div className="cam-slot tall map-cam-placeholder">
              <button
                type="button"
                className="btn primary"
                onClick={() => setCameraOn(true)}
              >
                Enable camera
              </button>
            </div>
          ) : (
            <PoseStage
              videoRef={videoRef}
              canvasRef={canvasRef}
              status={status}
              recording={transport === "recording"}
            />
          )}

          <div className="transport">
            {transport !== "recording" ? (
              <button
                type="button"
                className="btn primary"
                disabled={!ready}
                onClick={startRecording}
              >
                Record
              </button>
            ) : (
              <button
                type="button"
                className="btn danger"
                onClick={pauseRecording}
              >
                Pause
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              disabled={transport === "idle" && !segments.length}
              onClick={stopSession}
            >
              Stop
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!selectedId || transport === "recording"}
              onClick={deleteSelected}
            >
              Delete clip
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!segments.length || transport === "recording"}
              onClick={handleCloseGaps}
            >
              Close gaps
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!segments.length || transport === "recording"}
              onClick={clearAll}
            >
              Clear
            </button>
          </div>

          <Timeline
            segments={segments}
            playheadSec={playheadSec}
            durationSec={duration}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onScrub={(sec) => {
              if (transport === "recording") return;
              setPlayheadSec(sec);
            }}
          />
        </div>

        <aside className="map-side">
          <h2>Chart draft</h2>
          <label className="field">
            Song title
            <input
              type="text"
              placeholder="Midnight Groove"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as "easy" | "normal" | "hard")
              }
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="field">
            Model
            <select
              value={model}
              disabled={cameraOn}
              onChange={(e) => setModel(e.target.value as ModelKey)}
            >
              <option value="lite">Lite (fast)</option>
              <option value="full">Full</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>

          <dl className="map-stats">
            <div>
              <dt>Clips</dt>
              <dd>{segments.length}</dd>
            </div>
            <div>
              <dt>Samples</dt>
              <dd>{sampleCount}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{duration.toFixed(1)}s</dd>
            </div>
          </dl>

          {selected && (
            <p className="hint">
              Selected clip: {selected.startSec.toFixed(1)}s →{" "}
              {selected.endSec.toFixed(1)}s ({selected.samples.length} samples)
            </p>
          )}

          <p className="hint">
            CapCut-lite: Record creates a clip at the playhead, Pause ends it,
            click a clip to select, Delete removes it. Close gaps packs clips
            back-to-back.
          </p>

          <button
            type="button"
            className="btn primary"
            disabled={!sampleCount}
            onClick={exportJson}
          >
            Export JSON
          </button>
        </aside>
      </section>
    </main>
  );
}
