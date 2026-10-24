# ojustdance

Random dance battles, scored in the browser — Omegle matchmaking meets osu!-style user-mapped charts.

## What it is

Two strangers get paired into a live dance battle over a shared song chart. Each player’s webcam pose is graded **on their own device** against the chart. Scores stream over a match WebSocket so both sides see a live duel; the final result is persisted for history / leaderboards.

Creators map dances to songs (like osu! mapping): record a reference pose sequence timed to audio, save it as a chart, and publish it for random battles to pull from.

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
| **MediaPipe Pose** (in browser) | Track body + compare to chart | Proven in `demo/`; low latency; privacy-friendly (video never leaves the client) |
| **Express** (`backend/`, **Railway**) | Matchmaking, WebSocket rooms, authoritative match clock / final scores | Lightweight realtime hub; Railway is enough for sockets + short-lived match state |
| **Supabase** | Auth, Postgres, chart/song/user/match history storage | Managed DB + auth so the Express app stays thin |

**Important:** the server does **not** run pose estimation. It trusts (or lightly validates) client-reported scores for the hackathon, keeps the shared match timeline, and writes the settled result to Supabase. Video stays local.

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
