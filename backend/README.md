# backend — Express API

Matchmaking, WebSocket rooms, and match settle will live here. Right now it’s a minimal Express health check on port **3001**.

## Prerequisites

- Node.js 18+

## Setup (once)

From the **repo root**:

```bash
cd backend
npm install
```

`server.js` uses ES modules — `package.json` should include `"type": "module"`.

## Run

From **`backend/`**:

```bash
cd backend
node server.js
```

Or with auto-reload:

```bash
cd backend
npx nodemon server.js
```

If scripts are configured:

```bash
npm start          # node server.js
npm run dev        # nodemon server.js
```

API: **http://localhost:3001**

Health check:

```bash
curl http://localhost:3001/health
```

Expected: `{"ok":true}`

Override port:

```bash
# Windows PowerShell
$env:PORT=4000; node server.js

# macOS / Linux
PORT=4000 node server.js
```

## Env

Copy `.env.example` → `.env`:

```
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
SUPABASE_URL=https://....supabase.co
SUPABASE_SECRET_KEY=...
SUPABASE_DIRECT_CONNECTION_KEY=postgresql://postgres:PASSWORD@db....supabase.co:5432/postgres
```

On boot the API tries to create the `charts` table via `SUPABASE_DIRECT_CONNECTION_KEY`. If that fails (VPN/DNS), run `sql/init.sql` in the Supabase SQL editor once.

Chart reads/writes use the Supabase API (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`). Videos go to the `chart-videos` storage bucket (created automatically if missing). Make the bucket **public** (or adjust RLS) so Solo Battles can play previews.

## Chart API

| Method | Path | Body |
|--------|------|------|
| `GET` | `/charts` | list charts |
| `GET` | `/charts/:id` | one chart (+ full JSON) |
| `POST` | `/charts` | `multipart/form-data`: `chart` (JSON string) + `video` (file) |

## Notes

- Keep this on a different port than the Vite frontend (default frontend **5173**, backend **3001**).
- On Railway, bind to `process.env.PORT` (already used in `server.js`).
- Frontend smoke test: open **/api-test** and click **Ping /health**.
