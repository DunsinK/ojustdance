# Battle presentation

The `/battle` route uses the home page's existing concert artwork, coral lighting,
dark glass panels, lime controls, and handwritten accents. Home and Solo retain
their existing components. `EffectsProvider` wraps only Battle.

## How the pieces connect

`Battle.tsx` owns matchmaking and the server result. `PerformanceBattle.tsx` owns
reference playback and camera input. The reference video's `currentTime` drives
the pose, cue lane, progress, and judgments; animation does not advance the song.
`PerformanceDirector` emits stable gameplay events. The score, celebrations,
combo, lead banner, and optional sounds consume those events.

The player panels enter together, tracking readiness fills a body outline, and
reference poses travel toward a fixed glowing activation marker. Judgments have
distinct entrances. Combo milestones coordinate a banner, particles, score, and
stage lighting. Results display the actual server outcome. There is no simulated
opponent camera feed.

## Reference cues and skeletons

`reference.ts` accepts the existing provisional `motion-thumbnails/1` format with
the `reference-video-seconds` clock. It validates intervals, IDs, highlighted
parts, and bounded embedded still images. Overlapping intervals end at the next
onset. Cues use measured images or canonical skeleton poses.

Charts without authored thumbnails use explicitly labeled two-second **practice
phases**, only where a measured pose exists. These are timed previews, not
recognized movements. No Muse calls or invented choreography are involved.

The shared `@ojustdance/skeleton` adapter and topology supply geometry. Camera
readiness uses valid image-space joints, confidence, frame bounds, and independent
nondegenerate limb chains. Missing joints stay missing. Short trails follow
measured wrists and ankles and stop across tracking gaps. Display mirroring is
applied consistently to the reference, cue images, and player view.

## Provisional Battle judgment policy

This branch's existing `gradePose` supplies image-plane pose similarity. Battle
explicitly projects its comparison onto XY, preserving the original canonical
observations separately. The reference sample must be within 70 ms of song time;
this is not a search for a better matching pose in a wide timing window.

The director averages quality by elapsed observation time, once per interval.
It requires 65% tracking coverage. Quality thresholds are OK 0.45, GOOD 0.65,
and PERFECT 0.85. PERFECT also requires 85% overall coverage and adequate quality
and coverage in each third of the interval. These thirds are observation gates,
not inferred semantic movement phases. MISS and insufficient tracking award no
points; insufficient tracking gets a neutral message. GOOD/PERFECT extend the
combo. Duration-weighted interval budgets total at most 10,000 points per round.

Duplicate updates, repeated finishes, and backwards time cannot award twice.
Seeking discards affected intervals instead of replaying their awards. Pausing
the reference freezes scoring. Event IDs also prevent repeated celebrations.

This is a presentation adapter for the scorer currently on this branch. It does
**not** implement motion range, direction, semantic phase order, side-step travel,
or the proposed 40/30/20/10 movement score. The separate scoring branch can feed
accepted move results into the event interface without replacing the visuals.

## Audio, intensity, and resource use

Only the reference media supplies music. `StageAudio` uses one Web Audio source
and a frequency analyser when the media permits it. Cross-origin media without
audio-analysis permission retains native playback and ambient stage motion.
The stage reacts to measured audio energy, movement, combo, and celebrations;
it does not claim beat/BPM detection. Quiet synthesized effects default to off.

The Canvas2D stage avoids adding Butterchurn or another WebGL context alongside
MediaPipe. It is replaceable independently of gameplay events. Cue cards reuse
cached images or SVG skeletons. Their high-frequency transforms stay outside
React state. Particle counts, canvas resolution, and frame rates are bounded;
hidden tabs pause stage drawing. Trails, listeners, animation loops, audio nodes,
and observers are cleaned up on unmount.

Low/Normal/Ultra intensity, reduced motion, and SFX preferences persist locally.
System reduced-motion preference is respected. Reduced mode removes travelling
cue animation, trails, and particle bursts while preserving gameplay information.

## Running and verification

Use Node 22 or later. From `frontend`, run `npm run dev`, open `/battle`, and run
the backend on the configured `VITE_API_URL`. A real round needs matchmaking,
a chart, and camera permission. No new assets or provider credentials are needed.

`npm test` runs 24 shared skeleton tests and 14 presentation tests. The latter
cover frame-rate independence, one judgment per phase, tracking coverage, phase
gates, combo milestones, seek/duplicate protection, leader changes, bounded cue
validation, practice fallback, and canonical camera readiness. `npm run build`
checks TypeScript and produces the Vite bundle.

Local browser verification used a deterministic 14-second media/camera fixture
and mocked sockets: no public chart or match was created. It exercised matchup
entrance, cue movement, scoring, pause, settings, lead reversal, combo milestone,
tracking loss, one finish callback, and server-result reveal, including mobile
layouts. Real camera accuracy, network latency, and device GPU performance still
need playtesting. Vite reports a bundle-size advisory above 500 kB.
