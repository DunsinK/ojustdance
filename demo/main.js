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

const LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const mapBtn = document.getElementById("mapBtn");
const modelSelect = document.getElementById("modelSelect");
const fpsEl = document.getElementById("fps");
const landmarkCountEl = document.getElementById("landmarkCount");
const latencyEl = document.getElementById("latency");
const mapTimeEl = document.getElementById("mapTime");
const outputPanel = document.getElementById("outputPanel");
const jsonOut = document.getElementById("jsonOut");
const copyBtn = document.getElementById("copyBtn");

let poseLandmarker = null;
let running = false;
let lastVideoTime = -1;
let frameTimes = [];

let mapping = false;
let mapStartedAt = 0;
/** @type {Map<number, { count: number, sums: number[][] }>} */
let secondBuckets = new Map();

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

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/** Hip-centered, torso-scaled relative landmarks (size/position invariant). */
function toRelativeLandmarks(landmarks) {
  const hip = midpoint(landmarks[LEFT_HIP], landmarks[RIGHT_HIP]);
  const shoulder = midpoint(landmarks[LEFT_SHOULDER], landmarks[RIGHT_SHOULDER]);
  let scale = dist(shoulder, hip);
  if (!Number.isFinite(scale) || scale < 1e-6) {
    scale = dist(landmarks[LEFT_HIP], landmarks[RIGHT_HIP]) || 1;
  }

  return landmarks.map((lm) => [
    (lm.x - hip.x) / scale,
    (lm.y - hip.y) / scale,
    (lm.z - hip.z) / scale,
    lm.visibility ?? 0,
  ]);
}

function recordRelativeSample(landmarks) {
  const elapsedSec = (performance.now() - mapStartedAt) / 1000;
  const t = Math.floor(elapsedSec);
  const relative = toRelativeLandmarks(landmarks);

  let bucket = secondBuckets.get(t);
  if (!bucket) {
    bucket = {
      count: 0,
      sums: relative.map(() => [0, 0, 0, 0]),
    };
    secondBuckets.set(t, bucket);
  }

  bucket.count += 1;
  for (let i = 0; i < relative.length; i++) {
    const [x, y, z, v] = relative[i];
    bucket.sums[i][0] += x;
    bucket.sums[i][1] += y;
    bucket.sums[i][2] += z;
    bucket.sums[i][3] += v;
  }

  mapTimeEl.textContent = `${t}s`;
}

function buildMapJson() {
  const samples = [...secondBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, bucket]) => ({
      t,
      landmarks: bucket.sums.map(([sx, sy, sz, sv]) => [
        Number((sx / bucket.count).toFixed(5)),
        Number((sy / bucket.count).toFixed(5)),
        Number((sz / bucket.count).toFixed(5)),
        Number((sv / bucket.count).toFixed(4)),
      ]),
      framesAveraged: bucket.count,
    }));

  const lastT = samples.length ? samples[samples.length - 1].t : -1;

  return {
    version: 1,
    sampleRateHz: 1,
    durationSec: lastT + 1,
    model: modelSelect.value,
    recordedAt: new Date().toISOString(),
    normalization: {
      origin: "hip_midpoint",
      scale: "torso_length",
      axes: ["x", "y", "z", "visibility"],
      note: "Each sample is the average of all frames in that second. Coords are relative to hip midpoint, divided by mid-shoulder→mid-hip length.",
    },
    landmarkNames: LANDMARK_NAMES,
    samples,
  };
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `pose-map-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function finishMap() {
  mapping = false;
  mapBtn.textContent = "Map";
  mapBtn.classList.remove("recording");

  const data = buildMapJson();
  const text = JSON.stringify(data, null, 2);
  jsonOut.textContent = text;
  outputPanel.classList.remove("hidden");
  downloadJson(data);

  console.log("Pose map JSON", data);
  setStatus(`Map saved — ${data.samples.length} second(s)`);
  mapTimeEl.textContent = `${data.samples.length}s done`;
}

function toggleMap() {
  if (!running) return;

  if (mapping) {
    finishMap();
    return;
  }

  mapping = true;
  mapStartedAt = performance.now();
  secondBuckets = new Map();
  mapBtn.textContent = "Stop Map";
  mapBtn.classList.add("recording");
  mapTimeEl.textContent = "0s";
  outputPanel.classList.add("hidden");
  setStatus("Mapping — dance! Click Stop Map when done");
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
      color: mapping ? "#ff6b7a" : "#3dd6c6",
      lineWidth: 3,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: "#ffffff",
      fillColor: mapping ? "#ff6b7a" : "#3dd6c6",
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

    const landmarks = result.landmarks[0];
    const count = landmarks?.length ?? 0;
    updateStats(count, inferMs);

    if (count > 0) {
      if (mapping) {
        recordRelativeSample(landmarks);
        const t = Math.floor((performance.now() - mapStartedAt) / 1000);
        setStatus(`Mapping… ${t}s`);
      } else {
        setStatus("Tracking pose");
      }
    } else {
      setStatus(
        mapping
          ? "Mapping — no body in frame"
          : "No body in frame — step back / improve lighting"
      );
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
    mapBtn.disabled = false;
    setStatus("Camera on — stand in frame, then Map");
    requestAnimationFrame(predictFrame);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Failed to start", true);
    startBtn.disabled = false;
    modelSelect.disabled = false;
  }
}

startBtn.addEventListener("click", start);
mapBtn.addEventListener("click", toggleMap);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(jsonOut.textContent);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 1200);
  } catch {
    copyBtn.textContent = "Copy failed";
  }
});

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
