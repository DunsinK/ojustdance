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

### Create the `charts` table (required once)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project  
2. Left sidebar → **SQL Editor** → **New query**  
3. Paste everything from `backend/sql/init.sql` and click **Run**  
4. Confirm under **Table Editor** that `charts` exists  

(Optional) If direct Postgres works, the API also tries to create the table on boot.

### Storage / upload size

Default max video is **500 MB** (Multer + `chart-videos` bucket). Override with `MAX_VIDEO_UPLOAD_MB` in `.env`.

The bucket is created on first publish (public). Also check **Project Settings → Storage** global file size limit is ≥ that value.

Chart reads/writes use the Supabase API (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`).

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
