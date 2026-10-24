# frontend — ojustdance (React + Vite)

React Router UI for home, battle, map, and charts. Pose tracking and live API calls are not wired yet — UI shell only.

## Prerequisites

- Node.js 18+

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
| `/battle` | Battle queue / mock match |
| `/map` | Chart mapper shell |
| `/charts` | Chart list (placeholder) |

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

## API smoke test

1. Start the backend: `cd backend && npm run dev`
2. Start this app: `npm run dev`
3. Open **/api-test** → **Ping /health**

## Notes

- Dev server defaults to port **5173**. If something else is using it (e.g. the MediaPipe `demo`), Vite will pick the next free port — check the terminal output.
