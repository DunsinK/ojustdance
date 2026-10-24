import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm";

const MODEL_URLS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  heavy:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const modelSelect = document.getElementById("modelSelect");
const fpsEl = document.getElementById("fps");
const landmarkCountEl = document.getElementById("landmarkCount");
const latencyEl = document.getElementById("latency");

let poseLandmarker = null;
let running = false;
let lastVideoTime = -1;
let frameTimes = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function syncCanvasSize() {
  const width = video.videoWidth || canvas.clientWidth;
  const height = video.videoHeight || canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

async function createLandmarker(modelKey) {
  setStatus(`Loading ${modelKey} model…`);
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URLS[modelKey],
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

async function enableWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  syncCanvasSize();
}

function updateStats(landmarkCount, inferMs) {
  const now = performance.now();
  frameTimes.push(now);
  frameTimes = frameTimes.filter((t) => now - t < 1000);
  fpsEl.textContent = String(frameTimes.length);
  landmarkCountEl.textContent = String(landmarkCount);
  latencyEl.textContent = `${inferMs.toFixed(1)} ms`;
}

function drawResults(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const drawingUtils = new DrawingUtils(ctx);

  for (const landmarks of result.landmarks) {
    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: "#3dd6c6",
      lineWidth: 3,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: "#ffffff",
      fillColor: "#3dd6c6",
      radius: 4,
    });
  }
}

function predictFrame() {
  if (!running || !poseLandmarker) return;

  syncCanvasSize();

  if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
    lastVideoTime = video.currentTime;
    const started = performance.now();
    const result = poseLandmarker.detectForVideo(video, started);
    const inferMs = performance.now() - started;

    drawResults(result);

    const count = result.landmarks[0]?.length ?? 0;
    updateStats(count, inferMs);

    if (count > 0) {
      setStatus("Tracking pose");
    } else {
      setStatus("No body in frame — step back / improve lighting");
    }
  }

  requestAnimationFrame(predictFrame);
}

async function start() {
  startBtn.disabled = true;
  modelSelect.disabled = true;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is not available in this browser");
    }

    poseLandmarker = await createLandmarker(modelSelect.value);
    await enableWebcam();
    running = true;
    setStatus("Camera on — stand in frame");
    requestAnimationFrame(predictFrame);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Failed to start", true);
    startBtn.disabled = false;
    modelSelect.disabled = false;
  }
}

startBtn.addEventListener("click", start);

modelSelect.addEventListener("change", async () => {
  if (!running) return;
  try {
    poseLandmarker?.close();
    poseLandmarker = await createLandmarker(modelSelect.value);
    setStatus(`Switched to ${modelSelect.value}`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Model switch failed", true);
  }
});
