# Automatic motion thumbnails

This feature selects measured frames from the original dance video, removes the
background, and centers the dancer by default. It requires neither Muse nor
movement descriptions nor manual keyframe correction. Background removal and
centering have separate toggles in Map and Solo.

## How it works

1. The existing MediaPipe importer/camera hook also adapts observations through
   `MediaPipeStyleAdapter` from `@ojustdance/skeleton`. Legacy scoring arrays remain
   compatible. Original, unmirrored canonical pixel observations are retained.
2. `selectKeyframes.ts` builds projected-2D features for each arm, leg, and torso
   using the canonical skeleton's validity and derived joints. It normalizes limb
   positions by hip-to-shoulder distance and retains image-space hip travel as a
   separate channel. Image-relative Z never contributes to selection.
3. A three-sample median filter reduces jitter outside the stateless skeleton core.
   A bounded, time-aware pose-curve simplification keeps significant changes,
   extrema, and reversals. The largest joint displacement represents each chain,
   so a deliberate wrist/ankle change is not averaged away by stationary joints.
   Local trajectory curvature estimates tracking noise; sustained speed is not
   itself treated as noise. Noise-adjusted thresholds reject tiny movements.
   Four-second windows bound processing and provide milestones for long movements.
   A separate move-to-hold pass retains measured landings after fast transitions.
   Large, reliable short steps are not discarded just because curve simplification
   split their motion into pieces shorter than 0.1 seconds.
4. Tracking gaps, invalid roots/shoulders, individual-limb gaps, clip boundaries,
   coordinate changes, and large root teleports break the analysis curves. No
   missing coordinate is substituted with zero and no gap is interpolated.
5. Events reaching a target pose within 0.18 seconds can share a card. Events are
   grouped by their target time rather than a broad onset window: a quick step is
   retained even if a longer arm gesture begins at the same time. Consecutive target
   poses form consecutive presentation intervals; activation is the later of the
   detected onset and preceding representative-pose time. Repeated motions remain
   distinct. A final comparison keeps the stronger target when winning frames
   from neighboring groups are less than 0.25 seconds apart. At most 256 strongest cards are retained,
   then restored to chronological order. This is visual event selection, not a
   claim to recognize choreographic move names or all semantic movement boundaries.
6. Every card uses one still image, including large movements and travel. There is
   no alternating start/end preview or animated image. Candidate endpoint images come from
   measured observations within 0.08 seconds of the selected endpoint and within
   0.06 torso lengths of its smoothed body-part feature. A bounded sharpness
   comparison chooses a nearby clear image without moving to a different phase
   of a fast step or reducing the quarter-second separation from neighboring targets. Only the selected images
   are passed through a local MediaPipe person mask, then saved with transparency.
7. `MotionThumbnailQueue` scrolls cards against a glowing NOW target using only the
   reference video's `currentTime`. RAF writes transforms/opacity outside React
   state; paused media stops the animation loop. Seeking, restarting, or changing
   playback rate recalculates positions from media time rather than accumulated dt.

The selector runs in a module worker when Worker is supported. Thumbnail capture
uses one additional muted video, seeking serially with cancellation and 15-second
timeouts. Inference remains serial on the main thread, yielding between cards.
Cutouts use a separate instance of the existing lite Pose Landmarker with IMAGE
mode, CPU execution, and segmentation masks enabled. Loading has a 45-second
timeout. No new dependency, backend operation, or API key is needed; model/WASM
assets use the existing download URLs. Video pixels are processed locally.

## Improving selection with evidence

The current selection algorithm is `canonical-pose-events/4`. Version 1, 2, and 3 saved
tracks still validate and can be imported. Solo deliberately regenerates an old
selection once, using saved canonical observations when available, so old embedded
thumbnails and IndexedDB caches do not hide a selector update. Asset metadata is
independently versioned as `source-resolution-still/2`; old low-resolution assets
also regenerate automatically. Appearance-only changes reuse a current cue plan.
The renderer displays one representative still even for an imported legacy pair.

In Map, expand **Inspect selected motion frames** under the scrolling queue. All
representative images appear in a grid; clicking one seeks the paused original
video to its timestamp. No manual corrections are required by this workflow.
The graph shows where selected poses represent the measured trajectory poorly.
Download **local analysis** to retain the canonical samples, selection metadata,
and diagnostics as `motion-selection-review/1`. This excludes image bytes, media
URLs, and video content. It is a local download; nothing is sent to a provider.

`evaluateMotionSelection` reconstructs each valid body-part XY trajectory between
selected target poses with linear interpolation. The first observed pose of each
continuous tracking run is its baseline. Following the last selected target, the
last pose is held. Root/limb tracking gaps are separate runs and are never bridged.
Only moving part-samples contribute to the summary, so long holds cannot inflate
coverage. Error is the greatest joint displacement in torso-length units. Coverage
counts moving part-samples with error at most 0.18 torso lengths. The graph retains
at most 600 local error peaks. These are geometry diagnostics, not semantic dance
accuracy or proof that every important choreographic moment was captured.

To repeat an evaluation without MediaPipe, Muse, or the source video:

```sh
cd frontend
npm run test:keyframes
node scripts/review-keyframes.mjs /path/to/motion-selection-review.json /tmp/updated-review.json
```

The command compares the saved selection and the current selector on identical
observations. This makes an iteration reproducible: inspect missed moments, add a
focused regression, change selection, compare the same input, then inspect the
images again. It is not a learned model or an unattended guarantee of correctness.

A local 15.7-second screen recording was used for the historical v2 comparison. CPU
MediaPipe lite produced 202 observations from 235 sampled positions. On those
identical observations, v1 selected 15 target poses and v2 selected 38. Mean motion
reconstruction error fell from 0.251 to 0.139 torso lengths (about 45%); coverage
within 0.18 torso lengths rose from 49.9% to 69.9%. Source and selected-frame contact
sheets were inspected, including foot lifts and crossed-leg poses. These results
are one clip's diagnostics; tracking/backend/device differences can change them.
The recording and its extracted observations remain outside the repository.

## Background removal and core centering

`personSegmentation.ts` implements the replaceable `PersonSegmenter` boundary:
an analysis canvas goes in, a probability mask and pixel-space body framing come
out. The model's mask is copied before its result is closed. Analysis images fit
within 512 × 512 pixels; only selected still frames are segmented, rather
than every frame of the video. One analysis canvas is reused. That small canvas
is used only for detection: thumbnail RGB is drawn directly from the original
video, with the low-resolution mask sampled through the inverse crop transform.

`personMatte.ts` contains the pure geometry and alpha operations:

1. Foreground components determine body bounds. Tiny isolated mask speckles are
   excluded from framing. Substantial disconnected components, such as limbs,
   still contribute to the bounds.
2. The center is the midpoint of valid left/right hips, using the shared skeleton
   adapter and its confidence/visibility policy. If unavailable, use the average
   of at least two valid hips/shoulders; otherwise use the largest mask component's
   centroid. A core outside the body bounds also falls back to that centroid.
3. The core maps exactly to the center of a 384 × 432 image, three times the old
   width/height. Scaling fits the detected bounds around that core with 24 pixels
   of padding. The original video supplies the color pixels, so increasing output
   resolution does not simply enlarge the old analysis frame.
4. Bilinear mask sampling and a smooth probability ramp feather alpha edges.
   Transparent WebP is preferred, with PNG fallback. Encoding starts at quality
   0.94 and may use 0.90 to meet the per-image budget; quality never drops below
   that floor. High-quality canvas resampling is enabled. The queue shows the
   lane/glow behind the isolated dancer. Full-frame stills use JPEG, at most
   576 × 432 pixels, with the same quality floor.

This changes only thumbnail pixels: source video, canonical observations, cue
times, left/right labels, and scoring remain unchanged. Disabling both options
restores full-frame JPEG capture without loading the segmentation model. Centering
alone crops/repositions the original image while retaining its background.

Appearance metadata is independently versioned as `person-cutout/1`, with
`background: 'removed' | 'original'` and `centered: boolean`. Each centered image
also records its `centerMethod`. Legacy thumbnails without this metadata mean
original background, uncentered. Caches include appearance settings; saved cue
plans can be restyled from the original video without repeating motion selection.
All prepared appearance variants retain the existing bounded cache limits.

Mask failures are handled per cue: try at most three measured candidate frames,
then use a labeled original-video crop if a valid canonical body observation is
available. If no reliable person is available, skip the cue and retain the rest.
Model-loading failure can fall back to original stills. Each image declares its
actual `background` and `centered` settings; an original crop is never labeled a
successful cutout. The queue reports skipped/fallback counts and offers a retry.
Retry bypasses partial caches and rebuilds skipped cues from the full observations.
Cancellation is always honored. Unsupported contracts and an unreadable source
still produce actionable errors; missing people are a normal tracking gap.
Hair, fast motion, occlusion, low contrast, and multiple people can reduce mask
quality. One dancer is supported. The crop fits detected visible bounds; it cannot
recover body parts already outside the source video. Per-card centering removes
screen-position travel; the original video and cue timing retain that information.

See [recovery and source-video review](RECOVERY_AND_REVIEW.md) for the handling of
empty lead-ins/outros, the meaning of editor clips, the versioned preparation
report, and the independently marked red-shirt dance example.

## Clocks and display

`motion-thumbnails/1` uses `clock: 'reference-video-seconds'`. Cue activation,
interval end, and representative-image time are separate values. A goal image at
2.0 seconds can illustrate a motion beginning at 1.1 seconds: the card hits NOW at
1.1, not at 2.0. The card's still image stays fixed during playback and scrubbing.

The default lead-in is 3 seconds, adjustable from 1.5 to 6 seconds. Future cards
move right-to-left; their centers reach the fixed target at activation time.
Mirroring flips only the images, matching the reference-video mirror setting;
it never reverses queue travel or changes source timestamps.

`ChartSample.sourceTimeSec` preserves original-video positions when chart clips
are packed/moved. `t` remains the editable chart/scoring time. Thumbnail cues always
follow the original preview video, which the existing clip editor does not splice.
Camera recordings estimate source time from accumulated active recording duration,
excluding pauses; encoder startup/frame timing may add a small alignment error.

## Automatic app integration

Battle exposes an opt-in thumbnail toggle in the lobby and shared match player,
off by default. `useSavedChartThumbnails` accepts a fourth `enabled` argument;
disabled consumers skip cache/media/model work and abort pending preparation when
switched off. No thumbnail loading/error gates match start. The option stays local
to the player, preserves reference playback, and disables itself when no reference
video exists. Solo keeps thumbnails enabled by default with an option to hide them.

- **Map:** Import and analysis finish, or a camera recording is finalized, then
  preparation starts automatically. Deleting/packing clips regenerates the plan,
  reusing bounded session image caches. Preview playback/pause/scrub drives the
  full-width strip below the editor. No keyframe selection UI is required.
- **Publish:** The existing ChartDocument v1 has an optional, independently
  versioned `motionThumbnails` extension containing the plan and cached images.
  The existing chart JSON upload is sent as a file, avoiding multipart text-field
  limits. No database migration or new storage service is needed.
- **Solo:** New charts use embedded thumbnails directly, without inference or
  image extraction. Old charts automatically prepare a local cache on first load.
  They reuse canonical samples if present; otherwise they analyze the original
  video once. IndexedDB retains at most 8 old-chart caches, with a 5-entry memory
  fallback. Later playback/seek/retry reuses results. Quota/cache failures do not
  make successful preparation fail. A preparation error has an explicit retry.

Old charts do not contain canonical observations or original clip-to-video
mappings. Their local upgrade analyzes the original preview video, following the
same source-video clock that gameplay already uses. Removed/packed old clips cannot
be reconstructed reliably from their legacy normalized landmarks alone.

## Bounds and failure behavior

- Up to 18,000 samples / 20 minutes; extraction is 15 Hz in the existing UI.
- Up to 256 cards with one image each, and 256,000 encoded characters per image.
  Legacy imports can still contain two images per card.
- Persisted thumbnail payloads have a 24 MB image-data budget. The raw-frame
  session cache retains at most 96 images; prepared tracks remain bounded to three.
- No significant valid motion yields an explicit empty track, not fabricated cues.
- Missing video, decode errors, blocked canvas CORS, invalid versions, invalid
  timing, missing images, and unsupported image payloads produce useful errors.
- Embedded data must be bounded JPEG, PNG, or WebP data URLs. Cutouts require an
  alpha-capable PNG/WebP format. Temporary object URLs are not saved as
  thumbnail images. Object URLs still follow the app's existing video lifecycle.
- For old remote videos, the media host must allow anonymous CORS/canvas access.
- Use a stationary camera for best results: camera panning can resemble body
  travel. The cut detector is a large root-jump heuristic, not scene understanding.
- A smooth or subtle dance can be under-segmented; noisy footage can still create
  extra cards. Very fast moves are limited by the sampled pose cadence.
- Separate finalized camera sessions are not video-spliced by the existing mapper;
  keep a chart's source video consistent. Pause/resume within one session is supported.

## Files

- `contracts.ts`: provisional versioned track/cue/image metadata and budgets.
- `selectKeyframes.ts`: pure deterministic pose-event selection.
- `selector.worker.ts`, `prepare.ts`: worker orchestration and preparation.
- `media.ts`, `thumbnailAssets.ts`: cancellable seeks, image capture, quality/cache.
- `personSegmentation.ts`: replaceable local person-mask provider and cleanup.
- `personMatte.ts`: mask alpha, inverse crop sampling, body bounds, core framing.
- `observationFraming.ts`: measured canonical-pose framing when a mask fails.
- `visualReview.ts`: representative-time comparison against source-review windows.
- `timing.ts`: pure positioning and activation timing.
- `chartSamples.ts`: canonical/source-time adapter for existing chart segments.
- `validation.ts`: saved-track boundary validation.
- `cache.ts`, `useSavedChartThumbnails.ts`: legacy preparation and bounded caches.
- `../components/MotionThumbnailQueue.tsx` / `.css`: the shared visual strip.

## Run and validation

Use Node 22.12+ with the existing Vite tooling:

```sh
cd frontend
npm ci
npm test
npm run build
npm run dev
```

Open `/map`, import a short video, wait for automatic preparation, then play or
scrub the preview. Both **Remove background** and **Center dancer** default to on.
Toggle them to compare cutouts with the original framing. First use may take
longer while the local mask model loads. Published charts show the strip in `/solo`. Publishing is an
existing explicit app action; no remote writes were performed while implementing
or testing this feature.

`npm run test:keyframes` runs deterministic tests for static/jittery input,
arm lift/return, simultaneous/repeated movements, root travel, scale invariance,
missing/low-quality/degenerate input, gaps/cuts, image-depth independence,
determinism and immutability, clip/source clocks, lead-in/activation/seeking,
save/reload, malformed metadata, serial/cached image capture, and cancellation.
Selection regressions also cover small deliberate wrist movements, every peak of
repeated quick foot lifts, overlapping slow arm/fast leg gestures, constrained
sharpness candidates, reproducible coverage diagnostics, and gap handling.
Cutout tests cover alpha/feathering, RGB and opacity preservation, core fallbacks,
mask noise, full-body fit, appearance/asset compatibility, saved transparent images,
original-video RGB capture, higher resolution/encoding quality, legacy-pair conversion
to one still, quarter-second target suppression, and model/video cleanup after failure.
Recovery tests include missing people at both ends with a valid middle, all-absent
input, bounded neighboring-frame retries, labeled measured-pose fallback, offline
mask models, cancellation, malformed inference frames, and saved partial reports.
Media/canvas tests use host doubles; they do not claim browser decoding validation.
The existing skeleton tests also continue to run. Production build and focused
lint are checked separately. The repository has unrelated existing full-lint
findings in its mapper/camera/scoring/API code; rules were not weakened for them.

The queue also has a server-render smoke check covering the target, original-frame
image references and mirror class. A local headless Chrome
check imported the review recording and extracted 202 samples. This test overrode
the inference delegate to CPU because software WebGL was slow. A second preview
check replayed genuine, locally extracted CPU MediaPipe observations to avoid
repeating extraction, then ran real browser person segmentation/capture for all
38 cards. The rendered cutout grid was visually inspected; local analysis download
and click-to-seek were verified. This does not validate desktop GPU execution,
camera capture, or perfect mask quality; some mask artifacts remain in this
screen recording. The current still-only version was also checked with those saved
observations: it produced 28 cards, each with exactly one 384 × 432 image, no pair
indicator, and working click-to-seek. The source-resolution cutout grid was visually
inspected. This reduction from 38 cards reflects the requested quarter-second
suppression of back-to-back targets.
