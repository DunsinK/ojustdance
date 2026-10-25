# Record an attempt once, compare scoring changes later

Keep **Save pose data for scoring tests** enabled in Solo or Battle. Finish the
dance, or press **End early**. The app automatically saves the attempt on this
device. Open **Attempts** in the navigation, choose a recording, and press
**Replay with current algorithm**. No camera, video file, MediaPipe inference,
Muse request, or backend connection is needed to rescore it.

The original score is a saved measurement, not a value recalculated when the
page opens. Each replay adds a separate comparison with a label, date, scoring
policy, source fingerprint, final score, and score trace. Editing the scoring
code can change the next comparison but cannot overwrite the original result.

## What gets saved

`dance-attempt/1` contains:

* An ID, recording date, Solo/Battle mode, and complete/incomplete status.
* A copy of the reference chart's pose samples and clip metadata. Thumbnail
  images and temporary media URLs are excluded.
* The reference timeline, actual media duration, source image dimensions, and
  mirror convention used in the attempt.
* Every camera observation delivered to the scorer, including canonical joint
  positions, missing points, quality, depth metadata, capture song seconds,
  delivery song seconds, and whether the original scorer accepted it.
* The ordered `advance`, observation, and final `finish` calls.
* The original scorer policy, implementation fingerprint, full result, and
  cumulative score trace. Results retain unrounded numbers; the UI rounds
  displayed game points.

These are joint observations, not camera video or screenshots. Image-space XY,
image-relative depth, confidence, and visibility remain distinguishable through
the shared canonical frame contract. A null observation means tracking was
missing. Zero is never substituted for an unavailable coordinate.

The recorder clones source data so subsequent changes to a frame, reference
chart, or UI state cannot alter the saved inputs. It stores raw observations,
not just today's angle features, so changes to feature extraction can also be
tested. It records rejected observations too: a future acceptance policy can
reconsider them.

## Why save clock calls as well as points?

The scorer finalizes blocks after a bounded delivery deadline and prunes old
observations. Replaying all frames at once or feeding them at an invented clock
rate can change which observations are available at each decision.

`replayAttempt` rebuilds the reference from its saved raw snapshot, then feeds
the original calls in the original order into a fresh **current** `DanceScorer`.
It also repeats an early finish at the same song time. Under the same scoring
implementation and policy, the full result and score trace must match exactly.
Scoring changes therefore see the same camera observations and timing history.

The old `originallyAccepted` field is diagnostic; it does not force the new
algorithm to make the same decision. Historical policy versions are validated
as data, independently of the current `scoringConfig` policy checks. Replays use
the current fixed rules and the original tolerance by default. The UI permits
an explicit 30–70 ms tolerance change and stores it on the new comparison.

The implementation fingerprint hashes the TypeScript sources in `src/scoring`
and `shared/skeleton/src`, with sorted relative paths. It changes automatically
when these sources change, even without a commit. The browser and CLI use the
same fingerprint procedure. It does not hash secrets, camera data, or unrelated
repository files. It identifies source content; it does not archive executable
old scorer code or runtime/dependency versions. Keep normal version control for
recovering an old implementation. Finish a recording before editing code, then
refresh the page before comparing the new implementation.

## Compare and inspect

The Attempts screen shows the fixed original and every saved comparison, with
score differences, match percentage, tracking misses, and timing tolerance.
The chart compares original cumulative points with the latest replay. The
scrubber draws the nearest measured reference and player skeleton samples
through the shared `DanceSkeleton` topology. It does not interpolate missing
points or claim a stale sample was observed at the scrubber's exact time; both
actual sample timestamps are displayed.

A changed score shows changed algorithm behavior. To judge whether it is an
improvement, retain varied performances: correct motion, wrong side, standing
still, slightly early/late motion, and occlusions. Compare repeatability and
separation between these known cases. A higher average score alone is not a
quality metric.

## Local storage and backups

The IndexedDB database is `ojustdance-scoring-attempts`, version 1:

| Store | Purpose |
| --- | --- |
| `attempts` | Original recording and baseline, inserted with `add`, never overwritten with `put` |
| `summaries` | Small records for the list, inserted atomically with the recording |
| `evaluations` | Separate `dance-attempt-evaluation/1` comparison results indexed by attempt ID |

Duplicate imports are rejected; existing originals are unchanged. Storage
failures are shown rather than reported as a successful save. The completed
match retains **Download attempt** and **Retry saving attempt**, so a failed
browser write does not have to cost another dance. Recordings are never evicted
automatically. **Delete recording** explicitly removes that recording and its
comparisons from this device.

**Export recording** downloads the raw inputs and original result as JSON.
**Import recording** restores that package without rerunning inference or
altering the original score. Comparison history is stored separately and is
not included in that recording export; the CLI can export individual new
comparison results. Export/import between browsers, machines, or Vite origins
to reuse the same inputs. `localhost:5173`, `localhost:5175`, and `127.0.0.1`
have different browser storage.

NaN and positive/negative Infinity in rejected source coordinates are exported
using reserved single-property objects: `{"$number":"NaN"}`,
`{"$number":"+Infinity"}`, and `{"$number":"-Infinity"}`. The decoder restores
them exactly. Standard JSON's conversion of these values to null would corrupt
the original observations. Missing coordinates remain explicit canonical nulls.

Limits are 128 MB per imported/stored recording, 250,000 recorded calls, 75,000
observations, and the scorer's existing reference bounds. The recorder reserves
space for the final result and trace. When a capture limit is reached, the full
original score is still saved with `recordingStatus: limit-exceeded`; the UI
clearly disables full replay rather than treating a partial input as a complete
performance. Browser quota may impose a lower limit. Large recordings can take
noticeable time to serialize/save. Replay yields in batches and supports cancel.

Saving happens on completion or End early. Refreshing or leaving in the middle
of an unfinished dance discards that in-progress recording. Recordings from
before this feature cannot be recovered from old scores alone. Browser storage
can be cleared by the user or browser; keep JSON backups for important cases.

## Command-line regression runs

With Node 22.12+, from `frontend`:

```sh
npm run replay:attempt -- /absolute/path/dance-attempt.json
npm run replay:attempt -- /absolute/path/dance-attempt.json /absolute/path/new-comparison.json
```

The command compiles the shared/pure TypeScript modules, replays the saved
attempt with the current code, and prints original score, replay score,
difference, and both implementation fingerprints. An optional output path saves
the full new comparison and trace. It refuses to overwrite the original input
or any existing output file. It does not need a dev server and does not write
to the browser database or any remote service.

## Files and validation

* `contracts.ts`, `validation.ts`, `serialization.ts`: versioned recording data,
  strict import checks, and lossless numeric serialization.
* `AttemptRecorder.ts`: bounded, independent snapshots of live scorer calls.
* `replay.ts`: deterministic replay using the current scorer, with progress and
  cancellation. The original package is never modified.
* `storage.ts`: original insertion, summary reads, separate comparisons, and
  explicit local deletion through IndexedDB transactions.
* `scorerBuild.ts`, `implementationId.ts`: browser/CLI source fingerprints.
* `download.ts`, `AttemptPosePreview.tsx`, `pages/Attempts.tsx`: backup, measured
  skeleton inspection, and comparison UI.
* `components/LiveChartMatch.tsx`: capture and save completed/ended attempts.
* `scripts/replay-attempt.mjs`: command-line regression entry point.

Run `npm run test:attempts` for exact replay, immutable baseline/source copies,
occlusion/rejected-frame preservation, changed policy comparisons, historical
data compatibility, early finish, numeric round-trip, malformed imports, bounds,
cancel behavior, and fingerprint checks. `npm test` includes these tests with
the existing skeleton, thumbnail, and scoring suites.
