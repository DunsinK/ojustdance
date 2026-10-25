import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { fetchHealth } from "../lib/api";
import { markCameraCheckPassed } from "../lib/cameraGate";
import { PoseStage } from "../pose/PoseStage";
import { usePoseSource } from "../pose/usePoseSource";
import "./pages.css";
import "./CameraCheck.css";

const STEPS = [
  "Camera Check",
  "Find Opponent",
  "Get Ready",
  "Battle!",
] as const;

export function CameraCheck() {
  const navigate = useNavigate();
  const location = useLocation();
  const quiet = !!useReducedMotion();
  const fromPlay = Boolean(
    (location.state as { fromPlay?: boolean } | null)?.fromPlay,
  );

  const [enabled, setEnabled] = useState(true);
  const [bodyOk, setBodyOk] = useState(false);
  const [serverOk, setServerOk] = useState(false);
  const [serverPending, setServerPending] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  const { videoRef, canvasRef, ready, error, hasPose } = usePoseSource({
    mode: "camera",
    enabled,
    model: "lite",
  });

  const cameraOk = ready && !error;

  // Body in frame = MediaPipe is tracking a human pose.
  useEffect(() => {
    if (!cameraOk || !hasPose) {
      setBodyOk(false);
      return;
    }
    const t = window.setTimeout(() => setBodyOk(true), 500);
    return () => window.clearTimeout(t);
  }, [cameraOk, hasPose]);

  // Ready for battle = can reach the matchmaking server.
  async function pingServer() {
    setServerPending(true);
    setServerError(null);
    try {
      const data = await fetchHealth();
      if (!data.ok) throw new Error("Server returned not ok");
      setServerOk(true);
    } catch (err) {
      setServerOk(false);
      setServerError(
        err instanceof Error ? err.message : "Could not reach server",
      );
    } finally {
      setServerPending(false);
    }
  }

  useEffect(() => {
    void pingServer();
  }, []);

  const allReady = cameraOk && bodyOk && serverOk;

  function continueToBattle() {
    if (!allReady) return;
    markCameraCheckPassed();
    navigate("/battle", { replace: true });
  }

  function retryCamera() {
    setEnabled(false);
    window.setTimeout(() => setEnabled(true), 80);
  }

  const ease = [0.2, 0.8, 0.2, 1] as const;

  return (
    <motion.main
      className="page camera-check-page"
      initial={
        quiet
          ? false
          : fromPlay
            ? { opacity: 0, scale: 0.9, y: 28 }
            : { opacity: 0, y: 16 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: quiet ? 0 : 0.5, ease }}
    >
      <div className="camera-check-bg" aria-hidden="true" />

      {!quiet && fromPlay && (
        <motion.div
          className="camera-check-burst"
          aria-hidden="true"
          initial={{ scale: 0.2, opacity: 0.65 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 0.65, ease }}
        />
      )}

      <div className="camera-check-top">
        <motion.header
          className="camera-check-head"
          initial={quiet ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: quiet ? 0 : 0.1, ease }}
        >
          <p className="camera-check-kicker">01 / CAMERA CHECK</p>
          <h1>Get battle ready.</h1>
          <p>
            Your browser will ask for the camera. Step back until your whole
            body fits, then enter the battle queue. Nothing is recorded or
            uploaded here.
          </p>
        </motion.header>

        <ol className="camera-check-steps" aria-label="Battle flow">
          {STEPS.map((label, i) => (
            <li key={label} className={i === 0 ? "active" : undefined}>
              <span className="camera-check-step-dot" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div className="camera-check-layout">
        <motion.section
          className={`camera-check-stage${bodyOk ? " tracking" : ""}`}
          aria-label="Camera preview"
          layoutId={quiet ? undefined : "play-portal"}
          initial={quiet ? false : { borderRadius: 999 }}
          animate={{ borderRadius: 18 }}
          transition={{ duration: quiet ? 0 : 0.5, ease }}
        >
          <PoseStage videoRef={videoRef} canvasRef={canvasRef} mirror />

          <div className="camera-check-badges">
            {cameraOk && (
              <span className={`camera-check-badge${bodyOk ? " live" : ""}`}>
                <span className="dot" aria-hidden="true" />
                {bodyOk ? "Tracking Active" : "Camera On"}
              </span>
            )}
            {!cameraOk && !error && (
              <span className="camera-check-badge">
                <span className="dot pulse" aria-hidden="true" />
                Requesting camera…
              </span>
            )}
            {error && (
              <span className="camera-check-badge warn">Camera blocked</span>
            )}
          </div>

          <div className="camera-check-callout">
            {error
              ? error
              : !ready
                ? "Allow camera access when prompted"
                : bodyOk
                  ? "Looking good!"
                  : "Step back — show your full body"}
          </div>
        </motion.section>

        <motion.aside
          className="camera-check-side"
          initial={quiet ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: quiet ? 0 : 0.18, ease }}
        >
          <ul className="camera-check-list">
            <li className={cameraOk ? "ok" : error ? "bad" : "pending"}>
              <span className="camera-check-mark" aria-hidden="true">
                {cameraOk ? "✓" : error ? "!" : "○"}
              </span>
              <span>
                <strong>Camera access</strong>
                <small>
                  {error
                    ? "Permission denied — allow camera and retry."
                    : cameraOk
                      ? "Camera is working properly."
                      : "Waiting for browser permission…"}
                </small>
              </span>
            </li>
            <li className={bodyOk ? "ok" : cameraOk ? "pending" : ""}>
              <span className="camera-check-mark" aria-hidden="true">
                {bodyOk ? "✓" : "○"}
              </span>
              <span>
                <strong>Body in frame</strong>
                <small>
                  {bodyOk
                    ? "Your whole body is visible."
                    : cameraOk
                      ? "Stand back until pose tracking locks on."
                      : "Needs camera first."}
                </small>
              </span>
            </li>
            <li
              className={
                serverOk ? "ok" : serverPending ? "pending" : "bad"
              }
            >
              <span className="camera-check-mark" aria-hidden="true">
                {serverOk ? "✓" : serverPending ? "○" : "!"}
              </span>
              <span>
                <strong>Ready for battle</strong>
                <small>
                  {serverOk
                    ? "All systems go — server reachable."
                    : serverPending
                      ? "Pinging matchmaking server…"
                      : serverError || "Server unreachable."}
                </small>
              </span>
            </li>
          </ul>

          {(error || serverError) && (
            <p className="api-error">{error || serverError}</p>
          )}

          <div className="camera-check-actions">
            {error && (
              <button
                type="button"
                className="btn primary"
                onClick={retryCamera}
              >
                Retry camera
              </button>
            )}
            {!serverOk && !serverPending && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void pingServer()}
              >
                Retry server
              </button>
            )}
            <button
              type="button"
              className="camera-check-enter"
              disabled={!allReady}
              onClick={continueToBattle}
            >
              <span className="play" aria-hidden="true">
                ▶
              </span>
              ENTER BATTLE QUEUE
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </button>
            <Link to="/" className="camera-check-home">
              ⌂ Back home
            </Link>
          </div>

          <p className="camera-check-note">
            <span aria-hidden="true">🔒</span>
            Pose landmarks stay on your device. Matchmaking starts on the next
            screen.
          </p>
        </motion.aside>
      </div>
    </motion.main>
  );
}
