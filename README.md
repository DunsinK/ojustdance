# ojustdance

A real-time dance-battle prototype: server matchmaking and shared chart timing work; camera publishing, pose scoring, and persistence are still being built.

## What it is

The target experience pairs two players into a dance battle over a shared song chart. The planned scoring system grades webcam pose **on each player's device** against that chart. Scores will stream over the match WebSocket, with final results persisted for history and leaderboards.

Creators will be able to map dances to songs (like osu! mapping): record a reference pose sequence timed to audio, save it as a chart, and publish it for random battles to use.

| Inspiration | What we take |
|---|---|
| **Omegle** | Instant random 1v1 pairing; no friend list required to play |
| **osu!** | Community maps charts to songs; charts live in our DB |
| **Just Dance** | Full-body performance scored against a reference routine |

## Product flow (high level)

1. **Map** — Creator dances to a song while MediaPipe tracks pose → chart JSON (relative landmarks over time) → stored in Supabase with song metadata.
2. **Match** — Player hits “Battle”; Railway/Express matchmaking pairs them with another online player and assigns a chart.
3. **Play** — Both clients load the same chart + audio. Local MediaPipe grades each frame/window vs the chart; score ticks go up the WebSocket.
4. **Settle** — Server records winner / scores in Supabase when the match ends.

The `demo/` folder is the pose + mapping smoke test (MediaPipe in the browser). Ship the real app under `frontend/` + `backend/`.

## Recommended architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│  Player A (browser) │         │  Player B (browser) │
│  React + Vite       │         │  React + Vite       │
│  MediaPipe (local)  │         │  MediaPipe (local)  │
│  grade vs chart     │         │  grade vs chart     │
└─────────┬───────────┘         └─────────┬───────────┘
          │  score ticks / match events   │
          └──────────────┬────────────────┘
                         ▼
              ┌────────────────────┐
              │  Express on Railway│
              │  REST + WebSocket  │
              │  matchmaking,      │
              │  live match state, │
              │  settle results    │
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  Supabase          │
              │  Postgres + Auth   │
              │  charts, songs,    │
              │  users, match hx   │
              └────────────────────┘
```

### Why this split

| Piece | Role | Why |
|---|---|---|
| **React + Vite** (`frontend/`) | UI, camera, MediaPipe, local scoring, WS client | Fast DX; all heavy CV stays on-device so we don’t stream video to the server |
| **MediaPipe Pose** (in browser) | Track body + compare to chart | Pose estimation stays on-device; a preview video is uploaded only when a user publishes a Practice chart |
| **Express** (`backend/`, **Railway**) | Matchmaking, WebSocket rooms, authoritative match clock / final scores | Lightweight realtime hub; Railway is enough for sockets + short-lived match state |
| **Supabase** | Auth, Postgres, chart/song/user/match history storage | Managed DB + auth so the Express app stays thin |

**Important:** the server does **not** run pose estimation. Live Battle camera video stays local, while a user-published Practice chart may include an uploaded preview video. Battle scores are client-reported and the current matchmaking state is in memory.

### Current local integration

Battle connects to `backend/` over WebSocket for in-memory matchmaking, room phases, readiness, and shared test-chart delivery. Solo and Practice use browser-side MediaPipe pose processing and the Supabase chart API (`/api/charts`) for saved charts and preview videos. Configure `backend/.env` and manually run `backend/sql/init.sql` in Supabase before using the chart library; the backend deliberately does not apply schema changes at startup. See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for setup details.

## Suggested stack (concrete)

| Layer | Choice |
|---|---|
| Frontend | React 18+, Vite, TypeScript |
| Pose / grading | `@mediapipe/tasks-vision` Pose Landmarker (same idea as `demo/`) |
| Realtime | `ws` or Socket.IO on Express |
| Backend host | Railway (Express process) |
| Data + auth | Supabase (Postgres + Auth); charts as JSON (or JSONB) |
| Audio / charts | Song URL or storage object + timed relative-pose samples |

## Repo layout

```
ojustdance/
  demo/       # Local MediaPipe pose + Map → JSON smoke test
  frontend/   # React + Vite app (battle UI, mapper, grading)
  backend/    # Express matchmaking + WebSocket + settle API
  README.md   # This file
```

## Chart data (from mapping)

Mapped charts should store **body-relative** pose over time (hip-centered, torso-scaled), not raw screen coordinates — so different body sizes / camera distances still compare. The demo’s Map export is the prototype of that format (1 Hz samples today; production charts will likely want a higher sample rate, e.g. 10–30 Hz, aligned to the song clock).

## Build order (suggested)

1. Harden chart format + mapper UX (evolve `demo/` into `frontend` mapper)
2. Local single-player: play chart, show live score (no multiplayer yet)
3. Supabase: users, songs, charts CRUD
4. Express on Railway: queue → pair → WS room → score ticks → settle row in Supabase
5. Polish: random chart pick, rematch, basic anti-cheat / score sanity checks

## Demo

See [`demo/README.md`](demo/README.md) to run the webcam pose + Map JSON prototype locally.
