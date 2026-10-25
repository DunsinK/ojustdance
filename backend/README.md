# ojustdance backend

Express chart API and a WebSocket game service for local multiplayer testing.

## Configure and run

Requires Node.js 22.18 or newer.

```sh
# Create this only if backend/.env does not already exist; do not overwrite configured credentials.
cp -n backend/.env.example backend/.env
# Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env.
# Run backend/sql/init.sql in the Supabase SQL editor before using the chart library.
npm install --prefix backend
npm start --prefix backend
```

The server listens on `http://localhost:3001` by default. `FRONTEND_ORIGIN` controls HTTP CORS. The frontend's local Vite proxy works without a `VITE_API_URL`.

`SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) is server-only. Do not add it to frontend configuration or commit `.env` files. `SUPABASE_DIRECT_CONNECTION_KEY` is optional and used only as a Postgres fallback. Chart-table setup is deliberately manual; the server does not run DDL against Supabase during startup.

## Endpoints

- `GET /health` or `GET /api/health` reports backend and Supabase configuration status.
- `GET /api/chart` returns the shared test chart from `shared/sample-chart.json`.
- `GET /api/charts` lists up to 100 saved charts.
- `GET /api/charts/:id` loads a chart and its pose samples.
- `POST /api/charts` stores chart JSON and optionally uploads a preview video to Supabase Storage.
- `WS /ws` handles matchmaking and room state.

WebSocket clients send `find`, `cancel`, `leave`, and `ready` messages. Clients may send `score` messages during a battle; the server validates and aggregates submitted values but does not calculate pose scores. Server messages are `hello`, `snapshot`, and `error`.

Practice video uploads create or update the configured public storage bucket (`chart-videos` by default). The bucket's size limit follows `MAX_VIDEO_UPLOAD_MB`.

Chart publishing is currently unauthenticated and has no per-user ownership or rate limiting. Keep it behind a trusted network for testing; add authentication, authorization, and upload limits before exposing it publicly.

## Local test flow

Start the frontend with `npm run dev --prefix frontend`, open it in two browser tabs, then open **Play Now** and choose **Battle** in both. The first client waits in the queue; the second is paired with it. Both receive the same explicitly labeled sample chart and server-controlled phase clock.

## Current limits

Battle matchmaking, rooms, player identities, and scores are held in memory in one backend process. Restarting the server clears them. Solo and Practice use browser-side MediaPipe pose processing and Supabase-backed chart storage. Battle score submissions remain client-reported and are not suitable for production trust.
