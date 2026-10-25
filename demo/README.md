# demo — MediaPipe pose smoke test

Standalone webcam pose tracker (no React). Use this to verify body tracking and chart mapping before wiring MediaPipe into the main app.

## Prerequisites

- Node.js (for `npx serve`) **or** Python 3
- Browser with camera access (Chrome / Firefox / Edge)
- Network on first load (CDN + model download)

## Run

From the **repo root**:

```bash
npx --yes serve demo -p 5173
```

Or from **this folder**:

```bash
cd demo
npx --yes serve -p 5173
```

Python alternative:

```bash
cd demo
python -m http.server 5173
```

Open **http://localhost:5173**

1. Click **Start** → allow the camera
2. Stand in frame — you should see a skeleton overlay
3. Optional: **Map** → dance → **Stop Map** to download relative pose JSON

Do not open the HTML as a `file://` URL; the camera API needs `localhost` or HTTPS.

## What “working” looks like

- FPS roughly 20–60 (machine / model dependent)
- Landmark count **33** when a body is visible
- Cyan skeleton over the mirrored video

Prefer **Lite**; use Full / Heavy only if tracking is noisy.

## Map export

Stop Map downloads `pose-map-*.json` (also shown on the page). One averaged sample per second: hip-centered, torso-scaled `[x, y, z, visibility]` for all 33 landmarks.
