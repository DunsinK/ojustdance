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

## Notes

- Keep this on a different port than the Vite frontend (default frontend **5173**, backend **3001**).
- On Railway, bind to `process.env.PORT` (already used in `server.js`).
