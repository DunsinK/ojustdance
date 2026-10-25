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

Grading: `src/pose/gradePose.ts`. Socket helper: `src/lib/socket.ts`.

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
