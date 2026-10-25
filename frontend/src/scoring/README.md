# Dance scoring, version 2

The player compares the dancer's **pose shape and movement at song time** with
the recorded reference. It does not score the thumbnail pictures. Solo and Battle
both use `LiveChartMatch`, which now uses this scorer.

The code is in the frontend because it scores camera observations locally. It
imports the shared `@ojustdance/skeleton` package for joint names, topology,
validation, coordinate conversion, and the provider adapter. That shared package
remains independent of the game. These scoring modules are plain TypeScript,
with no React or DOM dependency, so they can move into a shared scoring package
if another consumer needs them.

## How the pieces connect

```text
reference chart canonical frames ── buildReferenceTrack ─┐
                                                       ├─ DanceScorer ─ score/judgment/combo
live camera ─ shared adapter ─ canonical image frames ──┘
                                                        LiveChartMatch → Solo / Battle
```

`usePoseSource` still owns MediaPipe and camera acquisition. It now reports
`capturedAtMs`, measured with `performance.now()` immediately before inference.
The player subtracts inference/delivery time from the current media time to
place each observation on the song timeline. The scorer never uses a MediaPipe
landmark index or response wrapper.

| File | Responsibility |
| --- | --- |
| `contracts.ts` | Versioned score, configuration, reference, observation, and feature types |
| `features.ts` | Extract comparable XY geometry from one canonical frame |
| `similarity.ts` | Compare shape and changes in shape/root position |
| `referenceTrack.ts` | Resample a chart on the scoring timeline; interpolate usable evidence |
| `legacyChartAdapter.ts` | Explicit compatibility boundary for old relative-landmark charts |
| `alignment.ts` | Find a short, constrained timing alignment |
| `DanceScorer.ts` | Keep one attempt's observations, finalized judgments, score, and combo |

`pose/gradePose.ts` reexports the public entry points for the existing player.
It no longer implements a separate landmark-distance scorer.

## 1. Compare body shape

For each arm and leg, we measure:

* Upper/lower bone directions (28% each of that limb's weight).
* Elbow/knee bend angle (24%).
* Wrist/ankle offset from its chain's shoulder/hip, divided by the chain's
  observed total length (20%).

Each limb has weight 1; torso lean has weight 0.6. Active reference body parts
receive 2.5 times their usual weight, so stationary legs cannot overwhelm an
important arm movement. Reference confidence/visibility conservatively weights
the expected evidence; unknown quality has weight 0.5. Joints with explicitly
low confidence or visibility (<0.5) are rejected by `DanceSkeleton`.

Angles are free of penalty within 5 degrees, then decrease linearly to zero
similarity at 60 degrees. Normalized endpoint differences have a deadband of
0.08 and reach zero at 0.75 chain lengths. These are provisional game-feel
settings, not medically or statistically calibrated thresholds.

We use isotropic, aspect-corrected image XY. Normalized X/Y is converted using
the original image width/height through the shared transform. Translation and
uniform body scale do not change form. Image-relative Z is preserved in the
original observations but deliberately excluded from scoring. World-meters and
pre-mirrored frames are rejected rather than silently mixed with image data.

Torso length normalizes **changes** in pelvis position, so stepping across the
scene can be compared separately from centered pose shape. Legacy charts have
already lost their original root travel; the compatibility adapter explicitly
reports this limitation.

## 2. Handle hidden points

A missing or rejected point removes only the features that require it. For
example, a hidden wrist removes that forearm direction, elbow bend, and wrist
offset; it does not remove the visible upper arm or the other limbs. A hidden
hip does not invalidate the unrelated arms.

Expected reference weights remain in the denominator. Missing player features
cannot improve their weighted form contribution. There must be at least 65%
of the expected weighted evidence and three supported limbs, or all reference
limbs if the reference contains only two. A reference needs at least two limb
groups to be usable at all. Partial evidence reduces points and cannot earn
`PERFECT` unless coverage reaches 95%.

Too little player evidence produces `TRACKING` and zero points for that time,
with a neutral UI message. It is not displayed as a confidently diagnosed dance
mistake. There is no stale-pose reuse, fabricated depth, or gap filling. Missing
reference sections are excluded from the maximum available score for everyone.
Gaps therefore cannot make a disconnected reference limb into a valid pose.

## 3. Allow a small timing difference

The default matching band is **±50 ms**. Before a Solo attempt starts, the player
can choose ±30–70 ms. Battle keeps both players on the default ±50 ms policy.
This setting and mirroring are locked during the attempt.
Positive reported offsets mean late; negative means early. Held poses have no
meaningful timing offset and show none.

At 20 fixed scoring opportunities per song second, a four-opportunity block
uses dynamic programming over candidate offsets spaced 10 ms apart, including
zero and the exact tolerance endpoints. The alignment must move forward, with
each player time step between 0.5 and 1.5 times the reference step. Its last
choice constrains the next block. This is a small band-constrained sequence
alignment, related to dynamic time warping, rather than an unrestricted search
for any similar pose elsewhere in the song.

Interpolation needs two compatible observations no more than 100 ms apart.
Only features valid at both ends survive. It never crosses an explicit missing
frame, clip/coordinate discontinuity, or long gap. Outside the observed range,
only a 15 ms edge margin is allowed. A frozen camera therefore stops earning.

For each supported opportunity:

```text
accuracy = evidence coverage × (70% form + 15% motion + 15% timing)
```

Motion compares feature changes and normalized root displacement. Tiny changes
below an activity floor are ignored (2 degrees for bends, 0.025 for normalized
direction/endpoint/root changes). Active motion allows a 15% difference in its
change magnitude before penalizing it. If motion similarity is below 35%,
accuracy is capped at 60% of coverage: standing still cannot receive a high
judgment during clear movement. Timing credit decreases with squared relative
lag, to 50% at the band edge. Alignment slightly favors smaller time shifts.

Judgments: `PERFECT` needs accuracy ≥90%, coverage ≥95%, and lag ≤30 ms;
`GOOD` ≥70%; `OK` ≥45%; otherwise `MISS`. Tracking failures and absent reference
have their own labels.

The separate **200 ms delivery deadline** allows inference results to arrive;
it does not let the dancer be 200 ms late. Results beyond that deadline are
discarded. Blocks finalize after their last opportunity plus the matching band
and delivery deadline, so visible feedback is delayed roughly 250–420 ms at the
default setting. The end of the video drains that same bounded deadline.

## 4. Award comparable points

The maximum is 10,000 per full reference. Points are the time-weighted accuracy
over usable reference duration. There is no combo multiplier. Early exit keeps
the full reference denominator; quitting during an easy introduction cannot
produce a full score.

Combo counts successful 0.5-second windows with average accuracy ≥70%. These
are fixed time windows, **not detected musical beats**. Render frames do not
create scoring opportunities. Identical camera streams at 30, 60, or 144 render
FPS must produce identical results. Repeated/paused/backward clock ticks do not
re-award finalized judgments. Restart creates a new scorer.

The original reference video remains unspliced when chart clips are moved.
With a reference video, scoring uses `sourceTimeSec` and video duration. Without
one, it uses chart `t` and duration. It does not compare edited chart times with
an unrelated original-video clock. Live observation and scheduling times are
seconds; canonical frame timestamps remain explicitly milliseconds.

Both live camera and default reference display are mirrored by CSS, while their
canonical observations remain anatomical and unmirrored. Unchecking “Mirror
video and scoring” explicitly reflects the reference X coordinates and exchanges
semantic left/right labels using the shared `mirrorFrame` operation. No display
transform is silently applied to live observations.

## Usage and contracts

```ts
import { DanceScorer, buildReferenceTrack, scoringConfig } from './scoring'

const config = scoringConfig({ timingToleranceMs: 50 })
const reference = buildReferenceTrack(chart, {
  config, timeline: 'source-video', durationSec: video.duration,
  imageSize: { width: video.videoWidth, height: video.videoHeight },
})
const scorer = new DanceScorer(reference, config) // one instance per attempt
scorer.addObservation({
  songTimeSec: capturedSongSeconds,
  receivedAtSongTimeSec: currentSongSeconds,
  frame: canonicalFrameOrNull,
})
const display = scorer.advance(currentSongSeconds)
const result = scorer.finish(reference.durationSec)
```

`dance-scoring/2` fixes the sampling, coverage, combo, deadline, and alignment
policies. Only tolerance is adjustable without a version change. The derived
reference schema is `dance-score-reference/2`; returned scores use
`dance-score/2`. Existing chart storage and numeric Battle socket payloads are
unchanged. A future authoritative multiplayer scorer must negotiate the same
policy/reference before comparing results; the existing backend still trusts
client-submitted scores.

`legacy-relative-chart/1` accepts old hip-centered, torso-scaled provider arrays
only with explicit original image dimensions. Its numeric mapping stays inside
the existing MediaPipe adapter. It recovers isotropic directions/angles using
the width/height ratio, but cannot recover global movement. Without dimensions,
an old chart shows a reimport/reference-video notice and earns no fabricated
score. New imports already preserve canonical observations.

## Run and validate

From `frontend`:

```sh
npm run test:scoring
npm test
npm run build
npm run dev
```

Use the repository's supported Node version (Vite requires Node 22.12+ here).
In Solo, choose a chart with its reference video, allow the camera, adjust the
timing slider if desired, and Start. Battle uses the same scoring component;
upcoming thumbnails remain optional. Try covering one wrist, then leaving the
frame; partial evidence and `TRACKING` should be distinguishable. Retry starts
a fresh attempt. No Muse, backend credentials, or new model asset is required.

Deterministic regression fixtures cover matching/incorrect/reversed/stationary
movement, root travel, 30–70 ms timing bands, hidden/low-confidence points,
degenerate geometry, scaling/aspect/depth, mirroring, delivery deadlines,
interpolation gaps, source-video timing, legacy charts, retries, early exit,
and refresh-rate invariance. They test algorithm behavior; they do not establish
the accuracy of real webcam measurements.

Validation performed for this change:

* `npm test`: 91 passing tests (24 skeleton, 42 thumbnail, 25 scoring).
* Production build with Node 22: passed, with the existing large-bundle warning.
* Focused ESLint on scoring and the changed player/types: passed. Repository
  lint still reports six existing errors and two warnings in `ApiTest.tsx`,
  `Map.tsx`, and `usePoseSource.ts`.
* Chrome with synthetic canonical camera observations and a local fixture video:
  matching motion reached 10,000; a hidden wrist reduced evidence/points;
  absent observations showed `TRACKING` and zero points; media pause stopped
  point accumulation; retry reset the attempt; the end deadline completed.
* Mocked Battle browser checks: thumbnail default-off, enable/disable/cancel,
  nonfatal preview failure, cached stills, and no-video behavior still passed.
  Matchmaking and camera/provider operations were mocked; no real queue was
  joined and no shared content was written.

## Remaining limits

* The webcam timestamp is inference start, not a hardware sensor exposure
  timestamp. Camera buffering and display/audio latency are not calibrated.
  A 50 ms search policy does not guarantee 50 ms physical timing accuracy.
* A 15 Hz reference cannot capture every event within 30 ms; interpolation
  estimates geometry between measured samples. Reference sampling and camera
  rate can limit the useful strictness of this setting.
* Projected XY cannot distinguish every movement toward/away from the camera,
  camera viewpoint, or depth-occluded pose. This scorer adds no depth estimator.
* Visibility is not proof of correct tracking. Unknown quality stays unknown.
  Missing player intervals earn no points to avoid rewarding hidden movement.
* Thresholds, motion weights, and judgments still need paired human recordings
  and repeatability testing across dancers, cameras, clothing, and viewpoints.
  Synthetic tests are a safe baseline, not a dance-quality benchmark.
* There is no beat detection, learned embedding, adaptive coaching, general IK,
  user latency calibration UI, or server-side anti-cheat in this change.
