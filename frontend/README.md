# frontend — ojustdance (React + Vite)

React Router UI for home, battle, map, and charts. Pose tracking and live API calls are not wired yet — UI shell only.

## Prerequisites

- Node.js 22.12+

## Setup (once)

From the **repo root**:

```bash
cd frontend
npm install
```

## Run (dev)

From **`frontend/`**:

```bash
cd frontend
npm run dev
```

Vite prints a local URL (usually **http://localhost:5173**). Open that in the browser.

Routes:

| Path | Page |
|------|------|
| `/` | Home |
| `/battle` | Socket.io queue + live duel |
| `/map` | Pose mapper (MediaPipe + timeline editor) |
| `/charts` | Chart list (placeholder) |
| `/skeleton-debug` | Canonical skeleton fixtures and joint validity |

## Other scripts

```bash
cd frontend
npm run build    # production build → dist/
npm run preview  # serve the production build locally
npm run lint     # ESLint
```

## Env

Create `frontend/.env` (see `.env.example`):

```
VITE_API_URL=http://localhost:3001
```

Restart `npm run dev` after changing env vars (Vite only reads them at startup).

## Map (pose + timeline + preview video)

1. Open **/map**
2. **Enable camera** → **Record** / **Pause** / **Stop** (Stop finalizes WebM preview), or **Import video** (MediaPipe analyzes the file)
3. Timeline: select / delete clips, close gaps
4. **Publish to library** uploads chart JSON + preview video to `POST /charts` (Supabase)

**Solo Battles** (`/solo`) lists charts, then runs `LiveChartMatch`: reference video + live camera, pose graded against chart samples with a live score.

**Battle** (`/battle`) uses Socket.io: queue → pair → shared chart → live rival scores. Test with two local browser windows (no deploy). LiveKit can add A/V later; scores stay on your server.

Grading: [`src/scoring`](src/scoring/README.md), reexported from `src/pose/gradePose.ts`.
It compares canonical limb geometry and movement with a default ±50 ms timing
band (adjustable from 30–70 ms before starting), handles partially hidden joints,
and awards a fixed maximum of 10,000 independent of display refresh rate.
Run `npm run test:scoring` for its deterministic regression suite.
Socket helper: `src/lib/socket.ts`.

Keep **Save pose data for scoring tests** enabled when dancing. Completed or
ended attempts save locally with their joint points and fixed original score.
Open **Attempts** (`/attempts`) to rerun the current scorer on the same inputs,
compare results, inspect skeleton points, or export/import a recording. No
camera or inference is needed during replay. See the
[attempt recording guide](src/attempts/README.md), including the command-line
`npm run replay:attempt -- recording.json` regression workflow.

## API smoke test

1. Start the backend: `cd backend && npm run dev`
2. Start this app: `npm run dev`
3. Open **/api-test** → **Ping /health**

## Notes

- Dev server defaults to port **5173**. If something else is using it (e.g. the MediaPipe `demo`), Vite will pick the next free port — check the terminal output.

## Canonical skeleton debug view

The shared skeleton package lives in [`../shared/skeleton`](../shared/skeleton/README.md),
outside the frontend. The app imports it as `@ojustdance/skeleton`; development
loads its source directly and production builds its JavaScript automatically.
Run `npm test` for its deterministic tests. With `npm run dev`, open
`/skeleton-debug` for fixtures, joint labels, validity, and explicit transforms.
Use Node 22.12+ for the existing Vite toolchain.

## Automatic motion thumbnails

Import or record a dance in `/map`: original-video motion thumbnails are selected
and cached automatically, then scroll through a glowing target during preview
and `/solo` playback. Background removal and core centering default to on, with
separate toggles to compare against the original video framing. No Muse or manual
keyframe editing is needed. See the
[implementation notes](src/keyframes/README.md) for timing, caching, and limitations.
Expand **Inspect selected motion frames** in Map to seek individual reference
poses or export a local analysis for reproducible selector comparisons.
Cards use one high-quality still each, with centered cutouts at 384 × 432 pixels.
Targets less than a quarter second apart keep the stronger representative.

In **Battle**, **Show upcoming move thumbnails** is optional and defaults to off.
Enable it in the lobby or during a match. The preference carries between matches
while the Battle page remains open. Switching it off hides the strip and its
controls and cancels pending thumbnail preparation. Loading/errors never delay
match start or reset reference playback. The option is unavailable without a
reference video. Solo keeps its existing on-by-default behavior and has the same
toggle. This is a local display preference; matchmaking/scoring payloads are unchanged.
An editor **clip** is a recorded/imported timeline section; thumbnail cues are
selected from its poses. Missing people and individual mask failures are handled
per frame/cue, preserving the usable result. See [recovery and review notes](src/keyframes/RECOVERY_AND_REVIEW.md).
