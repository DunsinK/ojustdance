import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapAgent } from "../components/MapAgent";
import { Timeline } from "../components/Timeline";
import { publishChart } from "../lib/api";
import { analyzeVideoFile } from "../pose/analyzeVideo";
import {
  buildChartDocument,
  closeGaps,
  timelineDuration,
} from "../pose/exportChart";
import {
  startSessionRecorder,
  videoExtension,
  type SessionRecorder,
} from "../pose/mediaRecord";
import { PoseStage } from "../pose/PoseStage";
import type { ModelKey, TimelineSegment } from "../pose/types";
import { usePoseSource, type PoseSourceMode } from "../pose/usePoseSource";
import "./Map.css";
import "./pages.css";

const SAMPLE_HZ = 15;
const SAMPLE_INTERVAL_MS = 1000 / SAMPLE_HZ;

type Transport = "idle" | "recording" | "paused";

function newId() {
  return crypto.randomUUID();
}

function stampName(title: string, ext: string) {
  const safe = (title || "chart").replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safe}-${stamp}.${ext}`;
}

export function Map() {
  const [mode, setMode] = useState<PoseSourceMode>("camera");
  const [cameraOn, setCameraOn] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [transport, setTransport] = useState<Transport>("idle");
  const [segments, setSegments] = useState<TimelineSegment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] =
    useState<"easy" | "normal" | "hard">("easy");
  const [model, setModel] = useState<ModelKey>("lite");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzePct, setAnalyzePct] = useState(0);
  const [captureArmed, setCaptureArmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const transportRef = useRef(transport);
  const playheadRef = useRef(playheadSec);
  const activeSegIdRef = useRef<string | null>(null);
  const recordStartedAtRef = useRef(0);
  const segmentOriginRef = useRef(0);
  const lastSampleAtRef = useRef(0);
  const clockRafRef = useRef(0);
  const sessionRecorderRef = useRef<SessionRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  transportRef.current = transport;
  playheadRef.current = playheadSec;

  const {
    videoRef,
    canvasRef,
    landmarkerRef,
    streamRef,
    ready,
    error,
    fps,
    hasPose,
    mirror,
  } = usePoseSource({
    mode,
    enabled: cameraOn,
    fileUrl,
    model,
    liveDetect: !analyzing,
    onFrame: (frame) => {
      if (transportRef.current !== "recording" || !frame.hasPose) return;
      if (mode === "file") return; // file clips come from analyze / optional live later

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
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      analyzeAbortRef.current?.abort();
    };
  }, [fileUrl, previewUrl]);

  useEffect(() => {
    if (transport !== "recording" || mode !== "camera") {
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
  }, [transport, mode]);

  function setPreview(blob: Blob | null) {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
    setPreviewBlob(blob);
  }

  function enableCamera() {
    analyzeAbortRef.current?.abort();
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
      setFileUrl(null);
    }
    setFileName(null);
    setMode("camera");
    setCameraOn(true);
    setTransport("idle");
  }

  async function onImportFile(file: File) {
    analyzeAbortRef.current?.abort();
    setCameraOn(false);
    setTransport("idle");
    setSegments([]);
    setSelectedId(null);
    setPlayheadSec(0);
    setPreview(null);

    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setFileName(file.name);
    setMode("file");
    setTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
    setPreview(file);

    // Analyze runs after landmarker is ready (see effect below via analyzing trigger)
    setAnalyzing(true);
    setAnalyzePct(0);
  }

  useEffect(() => {
    if (mode !== "file" || !analyzing || !ready || !fileUrl) return;

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    const ac = new AbortController();
    analyzeAbortRef.current = ac;

    (async () => {
      try {
        video.pause();
        const samples = await analyzeVideoFile({
          video,
          landmarker,
          canvas: canvasRef.current,
          sampleHz: SAMPLE_HZ,
          signal: ac.signal,
          onProgress: ({ t, duration }) => {
            setAnalyzePct(duration ? Math.round((t / duration) * 100) : 0);
          },
        });

        if (ac.signal.aborted) return;

        const endSec = samples.length
          ? samples[samples.length - 1].t
          : video.duration || 0;
        const id = newId();
        setSegments([
          {
            id,
            startSec: 0,
            endSec,
            samples,
          },
        ]);
        setSelectedId(id);
        setPlayheadSec(0);
        await video.play().catch(() => undefined);
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error(err);
          alert(err instanceof Error ? err.message : "Video analysis failed");
        }
      } finally {
        if (!ac.signal.aborted) {
          setAnalyzing(false);
          setAnalyzePct(0);
        }
      }
    })();

    return () => ac.abort();
  }, [mode, analyzing, ready, fileUrl]);

  async function startRecording() {
    if (mode !== "camera" || !ready) return;

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

    try {
      const stream = streamRef.current;
      if (!stream) throw new Error("No camera stream to record");

      if (!sessionRecorderRef.current) {
        sessionRecorderRef.current = startSessionRecorder(stream);
        setCaptureArmed(true);
      } else {
        sessionRecorderRef.current.resume();
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not start video capture");
      setTransport("idle");
      activeSegIdRef.current = null;
    }
  }

  function pauseRecording() {
    setTransport("paused");
    activeSegIdRef.current = null;
    sessionRecorderRef.current?.pause();
  }

  async function stopSession() {
    setTransport("idle");
    activeSegIdRef.current = null;
    const recorder = sessionRecorderRef.current;
    sessionRecorderRef.current = null;
    setCaptureArmed(false);
    if (recorder) {
      try {
        const blob = await recorder.stop();
        if (blob.size > 0) setPreview(blob);
      } catch (err) {
        console.error(err);
      }
    }
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
    if (mode === "camera") setPreview(null);
  }

  async function publishAll() {
    if (!sampleCount || publishing) return;
    if (!previewBlob) {
      setPublishError("Add a preview video (Stop a camera take or Import) before publishing.");
      return;
    }

    setPublishing(true);
    setPublishError(null);
    setPublishMessage(null);
    setPublishedId(null);

    try {
      const doc = buildChartDocument({
        segments,
        title,
        difficulty,
        model,
        sampleRateHz: SAMPLE_HZ,
      });
      const result = await publishChart({
        chart: doc,
        video: previewBlob,
        title: doc.title,
        difficulty: doc.difficulty,
        videoFilename: stampName(doc.title, videoExtension(previewBlob)),
      });
      setPublishedId(result.id);
      setPublishMessage(`Saved “${result.title}” to the library.`);
    } catch (err) {
      console.error(err);
      setPublishError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const duration = timelineDuration(segments);
  const sampleCount = segments.reduce((n, s) => n + s.samples.length, 0);
  const selected = segments.find((s) => s.id === selectedId);
  const stageActive = mode === "camera" ? cameraOn : Boolean(fileUrl);

  let status = "Enable camera or import a video";
  if (error) status = error;
  else if (analyzing) status = `Analyzing video… ${analyzePct}%`;
  else if (stageActive && !ready) status = "Loading MediaPipe…";
  else if (ready && transport === "recording")
    status = hasPose ? "Recording pose + video" : "Recording — no body in frame";
  else if (ready && mode === "file")
    status = hasPose
      ? `Imported · tracking ${fps} FPS`
      : `Imported${fileName ? `: ${fileName}` : ""}`;
  else if (ready) status = hasPose ? `Tracking · ${fps} FPS` : "Step into frame";

  return (
    <main className="page map-page">
      <header className="page-head">
        <span className="map-kicker">Create · Chart studio</span>
        <h1>Map a routine</h1>
        <p>
          Capture pose samples from your camera or a video, edit the timeline,
          then publish to the library for Solo and Battle.
        </p>
      </header>

      <ol className="map-steps" aria-label="Map steps">
        <li>
          <span>1</span> Capture
        </li>
        <li>
          <span>2</span> Edit timeline
        </li>
        <li>
          <span>3</span> Publish
        </li>
      </ol>

      <section className="map-editor">
        <div className="map-stage-col">
          <div className="map-panel map-panel--stage">
          {!stageActive ? (
            <div className="cam-slot tall map-cam-placeholder map-source-pick">
              <button
                type="button"
                className="btn primary"
                onClick={enableCamera}
              >
                Enable camera
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                Import video
              </button>
              <p className="meta-sub">
                Import runs MediaPipe across the file and uses it as the preview.
              </p>
            </div>
          ) : (
            <PoseStage
              videoRef={videoRef}
              canvasRef={canvasRef}
              mirror={mirror}
              status={status}
              recording={transport === "recording"}
            />
          )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onImportFile(file);
            }}
          />

          <div className="transport">
            {mode === "camera" && (
              <>
                {transport !== "recording" ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!ready || analyzing}
                    onClick={() => void startRecording()}
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
                  disabled={!captureArmed && transport === "idle"}
                  onClick={() => void stopSession()}
                >
                  Stop
                </button>
              </>
            )}

            <button
              type="button"
              className="btn ghost"
              disabled={analyzing || transport === "recording"}
              onClick={() => fileInputRef.current?.click()}
            >
              Import video
            </button>

            {mode === "file" && (
              <button
                type="button"
                className="btn ghost"
                disabled={analyzing || !ready}
                onClick={() => {
                  setAnalyzing(true);
                  setAnalyzePct(0);
                }}
              >
                Re-analyze
              </button>
            )}

            <button
              type="button"
              className="btn ghost"
              disabled={!cameraOn && mode === "camera"}
              onClick={enableCamera}
            >
              Use camera
            </button>

            <button
              type="button"
              className="btn ghost"
              disabled={!selectedId || transport === "recording" || analyzing}
              onClick={deleteSelected}
            >
              Delete clip
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!segments.length || transport === "recording" || analyzing}
              onClick={handleCloseGaps}
            >
              Close gaps
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!segments.length || transport === "recording" || analyzing}
              onClick={clearAll}
            >
              Clear
            </button>
          </div>

          <Timeline
            segments={segments}
            playheadSec={playheadSec}
            durationSec={Math.max(duration, mode === "file" ? playheadSec : 0)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onScrub={(sec) => {
              if (transport === "recording" || analyzing) return;
              setPlayheadSec(sec);
              if (mode === "file" && videoRef.current) {
                videoRef.current.currentTime = sec;
              }
            }}
          />
        </div>

        <aside className="map-side map-panel">
          <div>
            <h2>Chart draft</h2>
            <p className="map-side-lede">
              Title it, check length, then ship it to the library.
            </p>
          </div>
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
              disabled={stageActive}
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

          <div className="preview-block">
            <h3>Preview video</h3>
            {previewUrl ? (
              <video
                className="preview-video"
                src={previewUrl}
                controls
                playsInline
                muted
              />
            ) : (
              <p className="hint">
                Record a take (Stop finalizes capture) or import a file to attach
                a preview for the charts library.
              </p>
            )}
          </div>

          <p className="hint">
            Publish sends pose JSON + preview video to the API for Solo and
            Battle.
          </p>

          {publishError && <p className="api-error">{publishError}</p>}
          {publishMessage && (
            <p className="hint publish-ok">
              {publishMessage}{" "}
              <Link to="/solo">Open Solo Battles</Link>
              {publishedId ? ` · id ${publishedId.slice(0, 8)}…` : null}
            </p>
          )}

          <button
            type="button"
            className="btn primary"
            disabled={!sampleCount || publishing}
            onClick={() => void publishAll()}
          >
            {publishing ? "Publishing…" : "Publish to library"}
          </button>
        </aside>
      </section>

      <MapAgent />
    </main>
  );
}
