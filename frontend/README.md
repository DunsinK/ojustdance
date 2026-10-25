# frontend — ojustdance (React + Vite)

Festival-style landing (Vedik UI) plus functional Map / Solo / Battle flows (MediaPipe, Supabase charts, Socket.io).

## Prerequisites

- Node.js 22+

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
npm run dev
```

Usually **http://localhost:5173**. Start the backend on `:3001` for charts + battles.

| Path | Page |
|------|------|
| `/` | Festival landing → Play Now = Battle |
| `/battle` | Socket.io matchmaking + live duel |
| `/solo` | Practice vs a published chart |
| `/map` | Pose mapper + publish |
| `/charts` | Chart list |
| `/api-test` | Health ping |
| `/skeleton-debug` | Skeleton fixtures |

## Env

```
VITE_API_URL=http://localhost:3001
```

Restart Vite after changing `.env`.

## Notes

- Design docs (`DESIGN.md`, `ENTRY-REFINEMENT.md`, etc.) and `src/screens/*` demo UI are kept for reference; production navigation uses React Router + `src/pages/*`.
- Shared pose package: `@ojustdance/skeleton` under `../shared/skeleton`.

## Battle effects

The Battle route uses the home page’s visual style with animated cues, tracking
feedback, judgments, combos, audio-reactive lighting, and configurable intensity.
Home and Solo are unchanged. See [Battle presentation](src/performance/README.md)
for the event flow, provisional scoring policy, controls, and tests.
