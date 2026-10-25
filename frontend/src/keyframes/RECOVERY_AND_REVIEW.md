# Clips, tracking gaps, and reproducible keyframe review

## What a clip means

A clip is one editable section in the mapper timeline. Importing one video creates
one clip. Recording/pause/resume can create several sections. A clip stores its
start/end chart times and pose samples. A thumbnail cue is a separate item selected
from those observations; it is not an editor clip. `sourceTimeSec` preserves each
sample's position in the original video when editor clips are moved or packed.

The imported clip now keeps the full video's duration. A person disappearing at
the end does not shorten the chart to the last successful observation. Empty
lead-ins and outros stay on the original clock. No guessed poses are inserted.

## What happens when the person is missing

There are two distinct stages:

1. **Observation extraction.** Missing detections create gaps. A transient decode,
   inference, or malformed-observation failure skips that timestamp and processing
   continues. Progress includes absent-person and unreadable-observation counts.
   Every MediaPipe result is closed, including on error/cancellation. A decoder
   already in an error state fails subsequent seeks immediately instead of waiting
   fifteen seconds for every remaining timestamp. A completely unreadable source
   or unsupported contract still needs an actionable error and a source retry.
2. **Thumbnail preparation.** The selector requires an on-screen pelvis/chest and
   on-screen joints for each analyzed limb. The original observations are retained.
   Each cue tries at most three measured candidate times. A missing mask does not
   erase previously prepared images or terminate later cues.

If another measured candidate works, preparation records a recovery. If the mask
fails but a reliable canonical observation exists, `observationFraming.ts` supplies
a centered crop from the original video. That image retains its background and is
labeled **Original**, both in metadata and in the UI. It is not represented as a
successful cutout. The crop uses semantic joints from `DanceSkeleton`; it does not
create another skeleton, infer depth, or invent missing limbs.

If there is no reliable body observation or detection, the cue is skipped. Other
successful cues remain usable. If every cue is skipped, the queue explains that
no usable person frames were available and offers retry while retaining the video.
If the mask model itself cannot load, original stills are available as a fallback.
Unrecoverable individual image-budget failures also retain previous successful
cards. All retries are bounded and cancellation propagates immediately.

## Saved contracts and retries

The track schema remains `motion-thumbnails/1`. Current selection is
`canonical-pose-events/4`; current rendering/recovery is `source-resolution-still/2`.
Older selection and asset versions still validate and regenerate when used by Solo.
Single stills, 384 × 432 centered output, source-resolution RGB, quarter-second
target separation, and image-space-only motion selection remain in effect.

`ThumbnailImage.background` and `.centered` describe actual image appearance,
overriding the track's requested appearance when necessary. `centerMethod` records
the real center anchor. This allows mixed successful cutouts and original crops
without mislabeling the original crops as transparent foregrounds.

Optional `preparation: thumbnail-preparation/1` stores:

- Number of requested, skipped, fallback, and recovered cues.
- One issue record per affected cue: stable cue ID, source time, outcome, reason.
- Bounded reasons: absent person, unavailable segmentation/frame, image budget,
  or recovery using a neighboring frame.

Validation checks report versions, counts, issue IDs, finite timestamps, outcomes,
and per-image appearance. These reports survive chart export/import. Partial
results are not reused by the session capture cache. User retry bypasses persisted
partial results; when skipped cues must be restored, selection uses the complete
canonical observations again rather than retrying only the surviving cues.

## Independently reviewing the red-shirt dance

The supplied 12.25-second screen recording was inspected at four frames per second,
then its dance section at six frames per second. Ten useful pose windows were
recorded **before examining the selector output**. These include crossed feet,
wide landings, alternating arm crosses, and the final faster repetition. The
opening desktop overlay was marked as an excluded interval.

The reference lives in
[`red-shirt-cross-step.targets.json`](../../tests/fixtures/red-shirt-cross-step.targets.json).
It contains timing windows and review notes, not video or biometric observations.
The actual video, raw MediaPipe results, comparison images, and replay exports stay
outside the repository. These manually reviewed windows are a development
benchmark; end users do not need to select or correct frames.

On identical local CPU MediaPipe observations, the old selector selected 15 cues
and matched 6 of the 10 windows. The updated selector selects 21 cues and matches
all 10. No selected frame enters the excluded opening. Important measured times:

| Reviewed pose | Previous selected frame inside window | Updated selected frame |
| --- | --- | --- |
| First crossed feet | 3.73 s | 3.47 s |
| First wide landing | None | 4.20 s |
| Opposite crossed feet | 5.27 s | 5.33 s |
| Second settled wide landing | None | 6.53 s |
| First arm cross | 7.53 s | 7.60 s |
| First arm release | 8.87 s | 8.93 s |
| Opposite arm cross | 9.87 s | 9.93 s |
| Second arm release | 11.20 s | 11.00 s |
| Faster crossed feet | None | 11.60 s |
| Faster wide landing | None | 12.07 s |

Window coverage is a strict timing check, not a general choreography score. For
example, the old 6.20-second image was already approaching the wide pose but was
outside the independently marked settled-pose window beginning at 6.25 seconds.
The actual source and selected frames were also visually compared to avoid relying
only on the numerical count. Several extra cues remain; they are not a claim that
this video contains exactly 21 semantic dance moves.

The root cause was partly a short-segment filter: curve simplification split fast
steps into pieces shorter than 0.1 seconds and those pieces were rejected. The
selector now retains large, reliable short steps and detects measured pose holds
after transitions. Held targets use an early settled frame rather than a blurred
entry/exit. Static/jitter-only input and tracking discontinuities still produce no
invented movement. Earlier fixture tests were moved down within the image to give
their intentionally raised arms actual headroom; separate tests now explicitly
cover out-of-frame observations.

## Repeat the comparison

In Map, import the video and expand **Inspect selected motion frames**. Click
**Download local analysis**, then run:

```sh
cd frontend
npm test
node scripts/review-keyframes.mjs /path/to/motion-selection-review.json /tmp/updated-review.json tests/fixtures/red-shirt-cross-step.targets.json
```

The command compares the saved and current selections on identical observations,
prints trajectory error and exact visual-window matches, and reports selected
frames in excluded windows. Inference and Muse are not rerun. The comparison uses
representative frame times, not cue onset times. Reports with overlapping target
windows, duplicate target names, or unsupported versions are rejected.

The browser preview and a separate fault-injection check used the real source
video with locally extracted observations. Actual browser mask inference and
image capture produced all 21 stills. Deliberately failing the first/last masks
produced two labeled original crops while preserving all cues. Removing that
fault and clicking retry restored all cutouts. CPU was explicitly selected for
headless tests; desktop GPU behavior and perfect mask boundaries are not implied.

A final browser test imported the exact supplied video and ran the complete
browser MediaPipe extraction, without replaying observations. It continued through
seven absent-person samples, retained 177 observations, kept the full 12.25-second
duration, and generated 22 transparent stills with no skipped/fallback cues. All ten
visual-reference windows were covered, and the grid was visually inspected. The
21-versus-22 difference is expected between the separate Python and browser
extraction runs; fixed-observation comparisons above keep their inputs identical.

MediaPipe's input modes and frame processing follow its
[official browser guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).
Canonical frames continue to use the shared skeleton's video-start millisecond
clock and pixel-space conventions; cue and video positions remain seconds.
