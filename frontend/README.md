# ojustdance frontend

Vite + React + TypeScript frontend connected to the Express API and WebSocket backend, with a lime/coral rhythm-game UI. Battle uses the shared test chart; Solo and Practice use the Supabase-backed chart library.

## Run and validate

Node 22.18+ recommended.

```sh
npm install --prefix backend
npm install --prefix frontend
# Configure backend/.env and run backend/sql/init.sql in Supabase (see backend/README.md).
npm start --prefix backend
```

In a second terminal:

```sh
npm run dev --prefix frontend
```

Open the URL Vite prints (normally http://localhost:5173) in **two browser tabs**, open the **Play Now** mode picker, and choose **Battle** in both to test matchmaking and a shared round.

Run frontend checks with `npm run typecheck --prefix frontend`, `npm test --prefix frontend`, `npm run test:render --prefix frontend`, and `npm run build --prefix frontend`. Run backend tests with `npm test --prefix backend`. The render smoke checks are non-browser component checks; they do not validate layout.

For a separately hosted backend, set `VITE_BACKEND_URL` to its HTTP(S) origin for WebSocket matchmaking and optionally set `VITE_API_URL` to its HTTP(S) origin for the chart API. Local Vite development proxies `/api` and `/ws` to `http://localhost:3001`, so no frontend `.env` is required for local development.

## Game modes and limits

**Battle** is available at `/battle` and pairs two connected players through `WS /ws`, supplies both the same sample chart, tracks readiness, and owns the preview/countdown/battle timers. Matchmaking state is in memory.

**Solo** lists saved charts from `GET /api/charts` and runs camera pose matching locally in the browser. **Practice** records from the camera or imports a video, analyzes pose samples locally with MediaPipe, and publishes the chart JSON plus optional preview video through `POST /api/charts`. Chart rows live in Supabase Postgres and uploaded preview videos live in the configured Supabase Storage bucket.

Configure `backend/.env` with `SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`). Run `backend/sql/init.sql` once in Supabase before using chart listing/publishing. The backend does not automatically execute schema changes. MediaPipe's runtime and pose models are loaded by the browser from their configured CDNs.

`shared/sample-chart.json` is still clearly labeled test content and is used by Battle. Battle scores remain unavailable unless a scoring client submits updates through the adapter; the server does not invent a winner when scores are missing.

## Code map

| Path                           | Responsibility                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                  | Adapter subscription, phase routing, shared header/progress, camera consent, motion preference             |
| `src/screens/Landing.tsx`      | Headline, clearly labeled game showcase, three-step feature presentation                                   |
| `src/screens/Room.tsx`         | Matching animation, camera readiness, preparation/preview                                                  |
| `src/screens/Battle.tsx`       | Player feeds, score bands, feedback, countdown, coach and move queue                                       |
| `src/screens/Results.tsx`      | Outcome, final score reveals, performance and continuation                                                 |
| `src/components/Brand.tsx`     | Supplied wordmark and decorative icon primitives                                                            |
| `src/components/ModeShell.tsx` | Navigation shell for the deep-linked game modes                                                             |
| `src/pages/`                   | Solo chart library and Practice mapper                                                                      |
| `src/pose/`                    | Browser-side pose capture, chart parsing, and scoring                                                       |
| `src/lib/api.ts`               | Health, chart listing, chart loading, and publishing API calls                                               |
| `src/components/Performer.tsx` | Illustrated choreography avatar and move pictograms                                                       |
| `src/components/Stage.tsx`     | Replaceable stream panel and choreography renderer                                                         |
| `src/components/GameUI.tsx`    | Shared score, timing, song and upcoming-move HUD components                                                |
| `src/ui/`                      | Reusable CTA, number animation, viewport reveal, reduced-motion context                                    |
| `src/types.ts`                 | Frontend-facing contracts; additive optional pose feedback                                                 |
| `src/services/live-game-adapter.ts` | WebSocket client and frontend-facing game adapter                                                     |
| `src/hooks/useCamera.ts`       | Consent, failure handling, stale-request protection and cleanup                                            |
| `src/styles/`                  | Central tokens and responsive game layouts                                                                 |
| `public/brand/`                | Brand images, including the transparent animated wordmark asset                                            |
| `public/fonts/`                | Self-hosted Space Grotesk variable font and OFL license                                                    |
| `tests/`                       | WebSocket adapter and non-browser rendering smoke checks                                                   |

The mode routes are `/battle`, `/solo`, and `/map` (Practice). Route-level lazy loading keeps MediaPipe out of the landing-page bundle. `react-router-dom` handles route navigation and `@mediapipe/tasks-vision` powers browser-side pose analysis; no Tailwind or icon package is used.

## Backend connection

The frontend connects to `WS /ws`. It sends `find`, `cancel`, `leave`, `ready`, or `score`; the backend responds with a `hello`, complete `snapshot` updates, or an `error`. The server currently owns queue pairing, readiness, shared phase timing, and result aggregation in memory.

### LiveKit / WebRTC

Pass streams keyed by player ID through `App.streams`, or replace `renderers.Video` using `VideoPanelProps` with a LiveKit track component. The built-in renderer uses `srcObject`, mirrors/mutes local media, and uses contain-fit to preserve full-body framing. Its children provide the game feedback footer; a replacement should preserve a clear feedback area outside the camera image.

Production camera ownership, publishing, subscriptions, autoplay recovery and remote track cleanup are still integration work. Consolidate the local camera utility and publisher so they do not open duplicate tracks. Never publish the local preview implicitly.

### MediaPipe / scoring

Submit opted-in tracking updates through `GameAdapter.submitScore`. Scores are nullable until received; the server checks value ranges and identifies the submitting player from its WebSocket connection. It does not verify client-reported scores. The UI does not fabricate ratings, combos, or winners.

`Player.color` deliberately retains the legacy `'cobalt' | 'coral'` values for compatibility. UI local/rival roles now resolve to lime/coral. No backend migration is required for the branding change.

### Muse / Three.js / React Three Fiber

Normalize choreography to `Choreography` and millisecond-based `DanceMove` entries. Supply `renderers.Choreography` implementing `ChoreographyStageProps`. The same renderer appears on the large preview stage and in a compact battle coach slot: size its canvas to its parent, avoid fixed viewport dimensions, and provide a compact UI if needed. Use `elapsedMs` to seek the authoritative animation and `playing` for playback; handle null/loading/error states.

Default performers and cue pictograms are illustrations, not real generated animations. Connect authoritative move-to-icon metadata when Muse supports it. Add synchronized, user-gesture-authorized audio using `audioUrl`; no audio scheduler is implemented here. Pass both renderer keys when overriding one (`Video: VideoPanel`, for example).
