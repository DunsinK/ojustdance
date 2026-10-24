# ojustdance frontend

Vite + React + TypeScript. A complete, explicitly labeled local demo with lime/coral rhythm-game UI. Backend and `../demo` remain untouched.

## Run and validate

Node 22.18+ recommended (native TypeScript stripping is used by the controller tests).

```sh
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, normally http://localhost:5173. Production and validation commands:

```sh
npm run typecheck
npm test
npm run test:render
npm run build
npm run preview
```

There is no configured lint command. `test:render` uses the esbuild bundled with Vite to perform **non-browser** component smoke checks. It does not verify screen layout. See `DESIGN.md` for the exact validation status and browser limitation.

Vercel: root `frontend`, build `npm run build`, output `dist`. No demo environment variables or credentials are needed.

## Demo journey

Find a match → searching (4.2s) → opponent found → preview (30s) → **I'm ready to dance** → 3–2–1 → battle (30s) → results. Ready can be set during or after the preview. Next Opponent returns to searching; Play Again repeats with the simulated rival. Cancel/Leave return home and release the local camera.

Open **Demo controls** during a round to skip timers or simulate an error/disconnect. A skipped preview still requires Ready. Demo scores, feedback, combos, choreography metadata and opponents are fixtures. There is no actual music playback, generated choreography, network matching, pose estimation or video transmission.

Camera is optional and never requested automatically. Enable camera requests video only for a local preview (HTTPS/localhost required). Declining permission leaves the full demo usable. Turn Off and Leave stop tracks; a late permission response after leaving is discarded. Real publishing must be owned by the production video integration with explicit sharing consent.

## Code map

| Path                           | Responsibility                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                  | Adapter subscription, phase routing, shared header/progress, camera consent, demo tools, motion preference |
| `src/screens/Landing.tsx`      | Headline, clearly labeled game showcase, three-step feature presentation                                   |
| `src/screens/Room.tsx`         | Matching animation, camera readiness, preparation/preview                                                  |
| `src/screens/Battle.tsx`       | Player feeds, score bands, feedback, countdown, coach and move queue                                       |
| `src/screens/Results.tsx`      | Outcome, final score reveals, performance and continuation                                                 |
| `src/components/Brand.tsx`     | Real supplied wordmark and decorative icon primitives                                                      |
| `src/components/Performer.tsx` | Original demo vector performers and move pictograms                                                        |
| `src/components/Stage.tsx`     | Replaceable stream panel and choreography renderer                                                         |
| `src/components/GameUI.tsx`    | Shared score, timing, song and upcoming-move HUD components                                                |
| `src/ui/`                      | Reusable CTA, number animation, viewport reveal, reduced-motion context                                    |
| `src/types.ts`                 | Frontend-facing contracts; additive optional pose feedback                                                 |
| `src/demo/controller.ts`       | Isolated demo fixtures, timers, feedback and continuation                                                  |
| `src/hooks/useCamera.ts`       | Consent, failure handling, stale-request protection and cleanup                                            |
| `src/styles/`                  | Central tokens and responsive game layouts                                                                 |
| `public/brand/`                | Unmodified supplied logo copies; reference screenshot is not shipped                                       |
| `public/fonts/`                | Self-hosted Space Grotesk variable font and OFL license                                                    |
| `tests/`                       | Demo flow and non-browser rendering smoke checks                                                           |

`COMPONENT-REFERENCES.md` records the five 21st.dev reviews and selection decisions. Motion is the only new npm dependency; no Tailwind, icon library or second animation library was added.

## Integration handoff

These are frontend-facing interfaces, not invented server routes or event names. Agree actual wire schemas with each teammate and translate at the boundary.

### Socket.IO / room state

Implement `GameAdapter` with stable `subscribe`, `getSnapshot` and `dispatch`. Return the same immutable snapshot object until an event changes it; then notify listeners. Replace `DemoController` in `main.tsx`, mount `<App adapter={realAdapter} />`, and omit demo controls. Set `demo: false` when using real systems.

The server adapter owns room identity, peer readiness, connection states, authoritative elapsed/remaining time, final scores and outcomes. Derive the client clock from a server timestamp/offset. Unsubscribe events and dispose transports on cleanup. `rematch`/`next` express user intent; future winner-stays rules belong to the adapter, not presentation. Refresh currently restarts the demo; production room rejoin/deep links require backend identity policy.

### LiveKit / WebRTC

Pass streams keyed by player ID through `App.streams`, or replace `renderers.Video` using `VideoPanelProps` with a LiveKit track component. The built-in renderer uses `srcObject`, mirrors/mutes local media, and uses contain-fit to preserve full-body framing. Its children provide the game feedback footer; a replacement should preserve a clear feedback area outside the camera image.

Production camera ownership, publishing, subscriptions, autoplay recovery and remote track cleanup are still integration work. Consolidate the local camera utility and publisher so they do not open duplicate tracks. Never publish the local preview implicitly.

### MediaPipe / scoring

Existing `PoseFrame` and `ScoreUpdate` contracts remain. Submit opted-in tracking updates through `GameAdapter.submitScore` and receive reconciled scores in snapshots. `Player.feedback?: { rating: 'PERFECT' | 'GOOD' | 'MISS'; combo: number }` is additive and optional. The UI shows neutral guidance when absent; only the demo controller invents feedback. Mount landmark overlays in your custom Video renderer.

`Player.color` deliberately retains the legacy `'cobalt' | 'coral'` values for compatibility. UI local/rival roles now resolve to lime/coral. No backend migration is required for the branding change.

### Muse / Three.js / React Three Fiber

Normalize choreography to `Choreography` and millisecond-based `DanceMove` entries. Supply `renderers.Choreography` implementing `ChoreographyStageProps`. The same renderer appears on the large preview stage and in a compact battle coach slot: size its canvas to its parent, avoid fixed viewport dimensions, and provide a compact UI if needed. Use `elapsedMs` to seek the authoritative animation and `playing` for playback; handle null/loading/error states.

Default performers and cue pictograms are illustrations, not real generated animations. Connect authoritative move-to-icon metadata when Muse supports it. Add synchronized, user-gesture-authorized audio using `audioUrl`; no audio scheduler is implemented here. Pass both renderer keys when overriding one (`Video: VideoPanel`, for example).
