# Shared Beat frontend

Vite + React + TypeScript. A standalone, explicitly labeled dance battle demo. No backend, accounts, credentials, paid services, or camera are required. `../demo` and `../backend` are unchanged.

## Run locally

Node 22.18+ recommended (the Node test runner uses native TypeScript stripping).

```sh
cd frontend
npm install
npm run dev
```

Open the localhost URL Vite prints. To validate or preview production:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Vercel: set root directory to `frontend`, build command `npm run build`, output `dist`. No environment variables are required for the demo.

## Try the flow

Find a match → searching (4.2s) → opponent found → choreography preview (30s) → **I'm ready** → countdown (3s) → battle (30s) → results. Readiness can be set during or after the preview. The countdown waits for both the preview and your ready action. Next opponent starts a new search; Play again repeats with the simulated opponent. Cancel and Leave return home and stop local camera tracks.

Open **Demo controls** during a round to skip timers or simulate a disconnect/error. Retry starts a fresh match. Scores, dancers, the opponent, song metadata, and performance summaries are fixtures. There is no actual music playback, generated choreography, network matching, or pose analysis yet.

Enable camera is an explicit browser permission request for **video only**, used for a local preview. Demo mode never sends it anywhere. HTTPS or localhost is required. Permission denial leaves the entire demo playable. Turn camera off or leave to release tracks. Production camera sharing needs its own clear consent flow when the video integration is added.

## File map

- `src/App.tsx`: navigable landing, matchmaking, preview, battle and results views; shared shell and game controls.
- `src/types.ts`: frontend-facing data contracts and adapter/rendering interfaces.
- `src/components/Brand.tsx`: replaceable temporary star brand and original geometric dancer illustrations.
- `src/components/Stage.tsx`: stream-backed video panel and replaceable avatar placeholder, including loading/empty states.
- `src/hooks/useCamera.ts`: consent, errors, stream cleanup, and stale-request protection.
- `src/demo/controller.ts`: isolated mock matchmaking, monotonic timers, scores, outcomes and recovery.
- `src/styles/tokens.css`: centralized palette, typography, surfaces, motion and radius tokens.
- `src/styles/app.css`: responsive layouts, interaction styles and reduced-motion overrides.
- `tests/demo.test.mjs`: readiness gate, full round, continuation, cancellation, recovery, subscription cleanup.
- `DESIGN.md`: visual and accessibility rationale.

## Integration contract

These are frontend contracts, **not claims about existing server endpoints or event names**. Agree wire formats with the relevant teammates and translate at the boundary.

### Socket.IO / game state

Implement `GameAdapter` with stable `subscribe`, `getSnapshot`, and `dispatch` methods. `getSnapshot` must return a cached immutable object until state changes; notify subscribers after replacing it. Mount `<App adapter={realAdapter} />` in `main.tsx` instead of `DemoController` and omit `demoControls`. Set `demo: false` only when connected to the actual systems.

Map the backend's room events into `GameSnapshot`. Use a server-authoritative clock offset to supply `elapsedMs` and `remainingMs`, and authoritative scores/results. Support connecting, disconnected and error states. Unsubscribe socket listeners and dispose transports when unmounting. The adapter owns opponent readiness, room membership, reconnection, and continuation eligibility. Actions `rematch` and `next` express intent; the backend decides whether to reuse a room, queue, or use future winner-stays rules. The UI doesn't implement that policy.

### LiveKit / WebRTC

Pass a player-ID keyed `streams` map for remote/local `MediaStream`s, or provide `renderers.Video` implementing `VideoPanelProps` to render LiveKit's native track component. The default renderer assigns `srcObject`, mirrors only local video, and mutes only local audio. Production publishing, remote autoplay policy, subscriptions, track lifecycle, and sharing consent belong to the video adapter. The default local camera hook is a preview utility, not a LiveKit publisher; a production integration should consolidate camera ownership to avoid opening duplicate tracks.

### MediaPipe

Feed the opted-in local stream to your existing tracking service. `PoseFrame` carries timestamped landmarks and `ScoreUpdate` carries score, accuracy, combo, and player identity. Send updates through the optional adapter `submitScore`, then let authoritative snapshots drive the UI. Add a landmark overlay through the replaceable Video renderer. No pose model is bundled or duplicated here.

### React Three Fiber / Muse choreography

Translate Muse output to `Choreography` and timed `DanceMove` entries (milliseconds). Pass a `renderers.Choreography` component implementing `ChoreographyStageProps`; use `elapsedMs` to seek the avatar on the shared clock, `playing` for playback, and load `animationUrl` if supplied. Support null/loading states and reduced motion. Use `audioUrl` for a consent/user-gesture-based shared audio controller; audio scheduling is not simulated here. Retain the default Video renderer when overriding only the avatar (pass both renderer keys).

## Accessibility and validation

Semantic buttons, keyboard focus rings, skip navigation, focused main region on phase changes, ready/status/error messaging, player labels alongside colors, responsive layouts, tabular timers and score digits. Motion is limited to searching and screen entrances, with an explicit Motion toggle and `prefers-reduced-motion` overrides. No external fonts or image dependencies.

Live rooms intentionally aren't URL-addressable yet: room rejoin/deep linking requires the backend's room identity and authentication policy. Refresh restarts the demo. Real integrations, webcam hardware behavior, and browser visual QA need testing in the team's environment.
