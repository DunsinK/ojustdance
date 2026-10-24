# MediaPipe Pose Demo

Quick local smoke test: webcam → MediaPipe Pose Landmarker → skeleton overlay.

## Run

From this folder (or the repo root):

```bash
npx --yes serve demo -p 5173
```

Or with Python:

```bash
cd demo
python -m http.server 5173
```

Open **http://localhost:5173**, click **Start**, allow the camera.

Needs a modern Chromium/Firefox browser, camera permission, and network once (CDN + model download). After the first load the model is cached.

## What “working” looks like

- FPS in the ~20–60 range (depends on CPU/GPU + model)
- Landmark count **33** when a body is visible
- Cyan skeleton drawn on top of you (mirrored)

Use **Lite** first. Switch to **Full** / **Heavy** only if tracking feels noisy.

## Map (record dance)

1. **Start** camera, get in frame
2. Click **Map** and dance
3. Click **Stop Map** when done

You get a downloaded `pose-map-*.json` plus an on-page preview. One sample per second: hip-centered, torso-scaled relative `[x, y, z, visibility]` for all 33 landmarks (frames in each second are averaged).
