# Canonical dance skeleton (provisional v1)

Pure TypeScript, with no MediaPipe, Muse, rendering, rig, or temporal dependencies.
All wire contracts below are provisional and deliberately small. The existing
`demo/main.js` uses `result.landmarks[0]` and a separate unversioned chart export;
neither is adopted as a core contract. The demo is unchanged.

## Where this belongs

The canonical skeleton is a shared domain package, so it lives in
`shared/skeleton/`, outside the frontend and backend. Its private package name is
`@ojustdance/skeleton`; nothing is published to a registry. It has zero runtime
dependencies. The React/SVG debug page remains in `frontend/src/pages/` because
displaying a skeleton is a frontend responsibility.

```text
shared/skeleton/
  package.json                   Package entry points and independent build/test commands
  tsconfig.json                  Strict TypeScript compilation and declaration output
  src/
    index.ts                     Public imports for every consumer
    contracts.ts                 Names and shapes of the data exchanged between systems
    skeletonDefinition.ts        Fixed joint names, hierarchy, and midpoint dependencies
    DanceSkeleton.ts             Observation → joint pose → bone geometry
    observations.ts              Observation creation and conservative quality handling
    frameValidation.ts           Clear errors for invalid inputs and coordinate metadata
    immutable.ts                 Independent, frozen snapshots of caller-owned data
    transforms.ts                Explicit conversion, centering, scaling, and mirroring
    adapters/
      MediaPipeStyleAdapter.ts   Provider indices and provisional MediaPipe payload handling
      NamedJointFixtureAdapter.ts A different external input format proving replaceability
    depth/
      PassThroughDepthEstimator.ts     Keep supplied depth estimates
      TwoDimensionalDepthEstimator.ts  Explicitly discard depth
      bodyCalibration.ts               Check supplied length/scale assumptions
      solveBoneDepth.ts                Experimental, single-bone signed depth candidates
    fixtures.ts                  Repeatable sample poses, separate from the public core entry
  tests/skeleton.test.mjs         Behavioral checks through the package's public exports
  dist/                          Generated JavaScript and type declarations; ignored by Git

frontend/src/pages/SkeletonDebug.tsx   React/SVG consumer of the shared package
```

Start with `contracts.ts` and `skeletonDefinition.ts`, then read
`DanceSkeleton.constructPose`. It has three explicit stages: resolve joints,
compute predefined edges, and return a frozen snapshot. Adapters and experimental
depth calculations can be read separately when needed.

## How to explain the flow

1. **An observation says what the source saw.** For example, a left shoulder at
   `(100, 200)` with unknown Z and visibility `0.9`. It does not claim a character
   rotation, a dance move, or a reliable depth measurement.
2. **An adapter translates provider vocabulary.** A provider may call that shoulder
   landmark 11; the rest of the code only sees `leftShoulder` and declared units.
3. **The skeleton definition says what connects to what.** `leftUpperArm` always
   connects `leftShoulder` to `leftElbow`. Connectivity never depends on proximity.
4. **Pose construction does simple geometry.** If the elbow is at `(130, 240)` in
   the same pixel space, the projected bone vector is `(30, 40)`, its observed
   length is `50`, and its normalized direction is `(0.6, 0.8)`. Unknown depth
   stays unknown. If an endpoint is unusable, that edge is invalid.
5. **Other systems consume the result.** The browser can draw valid edges; Muse can
   interpret semantic joints; future retargeting can map them to character bones.
   Each system chooses explicit transforms or depth strategies before consuming a
   pose. The original observations remain available throughout.

## Run

The package can build and test independently, from the repository root:

```sh
npm --prefix shared/skeleton ci
npm --prefix shared/skeleton test
```

The frontend's existing workflow builds the local package automatically using its
own TypeScript compiler; a separate shared-package install is optional for that
workflow. From `frontend/`:

```sh
npm ci
npm test                 # builds and runs the shared package's tests
npm run lint             # checks the app and shared package source
npm run build
npm run dev -- --host 127.0.0.1
```

Use Node 22.12+ for the existing Vite/plugin toolchain. Open
`http://127.0.0.1:5173/skeleton-debug`. The separate SVG debug route includes joint
labels, deterministic fixture selection, invalid-joint reasons, centering/scaling,
mirroring, and 2D projection. It uses no additional rendering dependency. This is
an XY view; coincident XY projections can overlap even when their depths differ.

`npm run dev` uses the package's `development` export to load its TypeScript source
directly, so shared-source edits update the debug page. Production and Node
consumers use generated JavaScript, with generated `.d.ts` files for TypeScript.

Any future JavaScript or TypeScript package can add the same local dependency:

```json
"@ojustdance/skeleton": "file:../shared/skeleton"
```

That path is relative to a sibling consumer such as `frontend/` or `backend/`.
Build the shared package before a Node consumer starts. Then both can use:

```js
import { DanceSkeleton } from '@ojustdance/skeleton'
```

The backend has not been wired to pose processing in this branch. It can consume
the package later without importing frontend code. The same boundary supports
future MediaPipe/Muse integration and renderer packages.

## Contracts and coordinate conventions

See `src/contracts.ts`, `src/skeletonDefinition.ts`, and the runtime guards in
`src/frameValidation.ts`.

| Contract | Version / purpose |
| --- | --- |
| `SkeletonDefinition` | `dance-skeleton-definition/1`; frozen semantic tree, 23 joints / 22 bones |
| `JointObservation` | Part of frame v1; `position`, `valid`, optional `confidence`/`visibility`, required `depth` |
| `SkeletonFrame` | `dance-skeleton-frame/1`; observations + timestamp/timeline + explicit coordinate metadata |
| `SkeletonPose` | `dance-skeleton-pose/1`; original/current frame snapshots + joint/bone geometry and validity |
| `PoseSourceAdapter` | `id`, `toFrame(unknown)`; validates external formats and returns a canonical frame |
| `BodyCalibration` | `dance-body-calibration/1`; bone-length estimates, units, uncertainty/provenance, optional image scale |
| `DepthEstimator` | `id`, `reconstruct({frame, calibration?, previousPose?})`; strategy/status + reconstructed `SkeletonPose` |

- Timestamps are nonnegative **milliseconds from video-start or session-start**,
  never implicitly wall-clock time. `timeline.id` identifies that particular clip
  or session. Callers convert provider clocks and select the person/pose first.
- Axes are **X right, Y down, Z away from the camera**, right-handed. Semantic
  left/right mean the subject's anatomical sides, independently of screen side.
  Unsupported axes/handedness are rejected rather than guessed.
- `coordinates.mirrored` explicitly declares whether a spatial reflection has
  already been applied to the data. A CSS-mirrored video alone does not change it.
- `kind: 'image'` uses `normalized-image`, `pixels`, or normalized `body-units`.
  Required `imageSize` records the source width/height. Image origin describes XY:
  `image-top-left` initially, or `root-relative` after centering. Image-relative Z
  has its own hip-relative meaning, **not camera distance**.
- `normalized-image` has X/image-width, Y/image-height, and optional Z/image-width.
  It is anisotropic. `normalizedImageToPixels` multiplies X and Z by width and Y
  by height. Pose construction refuses anisotropic coordinates. This conversion
  corrects aspect ratio; it does not recover metric depth or undo perspective.
- `kind: 'estimated-3d'` uses `meters` or normalized `body-units`, with
  `depthModel: 'euclidean'`. Its origin is `hip-center`, `provider-origin`, or
  `root-relative`. Metric world estimates remain estimates. They are distinct
  from image observations and have no implicit scene/camera translation.
- Image `depthModel` is `none` or `image-relative`. Image-relative Z is retained
  for replacement estimators but **never included in Euclidean bone geometry**.
  The `none` model rejects numeric Z values.
- A missing joint is omitted or `{ position: null, valid: false, depth: ... }`.
  A valid XY observation can have `z: null`. Explicit `z: 0` is supplied depth,
  never a default. Ambiguous/inconsistent/discarded depth uses `z: null` and its
  explicit status. Unknown confidence/visibility is null or omitted, not 0 or 1.
- Depth provenance/status and `uncertainty` are separate from landmark visibility.
  Uncertainty is a standard-deviation estimate in current Z units, or null when
  unknown. A visible landmark does not imply certain depth. Future estimators can
  emit `constraint-estimate` provenance without changing the topology or consumers.

Malformed schema versions, clock values, quality fields, depth metadata, and
coordinate combinations throw descriptive boundary errors. External adapters
reject non-finite coordinates. Direct canonical frames may retain non-finite
numeric source observations for diagnostics: pose joints reject those observations
and expose no non-finite derived geometry. Thus `originalFrame` can deliberately
contain the rejected raw numbers; it is not a cleaned rendering representation.

## Topology and derived joints

`src/skeletonDefinition.ts` defines the parent-first tree once:

```text
pelvis → spine → chest → neck → head
                  ├→ leftShoulder → leftElbow → leftWrist → leftHandIndex
                  └→ rightShoulder → rightElbow → rightWrist → rightHandIndex
pelvis → leftHip → leftKnee → leftAnkle → leftHeel / leftToe
       → rightHip → rightKnee → rightAnkle → rightHeel / rightToe
```

Bone names describe semantic edges: `lowerSpine`, `upperSpine`, `neckBase`,
`headLink`, and each side's `Clavicle`, `UpperArm`, `Forearm`, `Hand`, `HipLink`,
`Thigh`, `Shin`, `HeelLink`, `Foot` (for example, `leftUpperArm`). Fingers/heels/toes
are optional direction landmarks, not a hand or foot rig. Missing optional points
invalidate only their incident edges. Valid distal observations are retained even
if an upstream chain is incomplete.

| Derived joint | Rule / required valid observations |
| --- | --- |
| `pelvis` | Midpoint of left/right hips |
| `chest` | Midpoint of left/right shoulders |
| `spine` | Midpoint of pelvis/chest; **approximate spine point** |
| `neck` | Midpoint of chest/head; **approximate neck point**, especially with nose proxy |

These four positions are always recomputed; supplied observations with those names
do not override the rules. Derived joints require both dependencies. Their Z is
known only when both input depths are known. Confidence/visibility use the minimum
when both are known; either unknown yields unknown. Depth uncertainty uses the
average of the two bounds, with no independence assumption; either unknown yields
unknown. Synthesized positions are marked `derived`.

`DanceSkeleton` defaults to minimum confidence and visibility 0.5. Unknown quality
is accepted and remains unknown; explicitly low quality invalidates the joint.
Thresholds are constructor options. Invalid joints have a null pose position and
a reason. Zero-length bones have observed length 0 but no direction and are
invalid. Other invalid edges have null geometry as appropriate. Endpoints with
valid XY but absent depth produce explicit `projected-2d` geometry. Only Euclidean
space with both depths present produces `estimated-3d` geometry. Never compare
these length categories as though they were interchangeable.

Use `getJoint`, `getBone`, `traverse(root?)`, `validEdges`, and the pose's semantic
records. Definitions and returned pose snapshots are deeply frozen. Construction
is deterministic and stateless; there is no previous-frame cache or interpolation.
Observed lengths belong to this user/frame, never to an avatar's fixed rig.

## Explicit transforms

- `normalizedImageToPixels(frame)` performs the aspect conversion above.
- `rootCenter(frame)` requires valid hips and returns a frame, the original
  frame snapshot, original root position, and scale 1. If root depth is unknown,
  centered Z is unknown rather than silently centered around zero.
- `scaleFrame(frame, positiveFactor)` explicitly resizes geometry/uncertainty in
  its existing units. It is not a pixel-to-meter unit conversion.
- `normalizeBody(frame)` centers and divides by the pelvis-to-chest distance,
  returning `body-units`, the original snapshot/root, and the divisor `scale`.
  It uses 3D torso distance only when Euclidean torso Z is available, otherwise
  projected XY distance. Missing/degenerate torso throws; no arbitrary fallback.
  These helpers use the default 0.5 quality thresholds.
- Recovery where coordinates exist: `original = normalized * scale + root`.
  Retain `originalFrame` to recover discarded/unknown depth and scene movement.
- `mirrorFrame(frame, {axisX, swapSides})` reflects X around an explicitly supplied
  axis and toggles `mirrored`. `swapSides: true` also exchanges every anatomical
  left/right label (a reflected reference dance); false keeps labels attached to
  the subject (a display reflection). Y/Z, visibility, and depth uncertainty stay
  unchanged. The caller must choose and retain this semantic convention. Applying
  the same reflection/convention twice restores labels and coordinates, within
  normal floating-point precision. No reflection happens during construction.

Pass `transform.originalFrame` as the optional second `constructPose` argument
when a pose should retain the pre-transform source. Composition is explicit;
retain the first source snapshot and each operation's parameters.

## Replaceable adapters

`src/adapters/MediaPipeStyleAdapter.ts` is the only runtime module with MediaPipe indices. Its provisional
`MediaPipeStyleAdapter` accepts **one selected pose**, not a MediaPipe response
wrapper, not the demo's averaged chart format:

```ts
{
  schemaVersion: 'mediapipe-style/1',
  timestampMs: 1200,
  timeline: { origin: 'video-start', id: 'clip-a' },
  space: 'normalized-image', // OR 'world-meters'; never mix the two arrays
  imageSize: { width: 1280, height: 720 }, // required for image, forbidden for world
  mirrored: false,
  depth: 'preserve-estimate', // OR 'omit'; explicit choice required
  landmarks: [ /* up to 33 {x, y, z?, visibility?, presence?, valid?} or null */ ]
}
```

Missing entries are allowed. Normalized image inputs are converted to pixel XY/Z;
world inputs remain meters with hip-centered origin. All supplied depths are
provider estimates with unknown uncertainty. `head` maps to the **nose proxy**.
The mapping follows the [official MediaPipe landmark list and output conventions](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).
An integration should wrap `result.landmarks[person]` or
`result.worldLandmarks[person]`, attach a deliberate clock/metadata choice, and
retain the provider payload separately if exact pre-conversion values are needed.

`NamedJointFixtureAdapter` demonstrates a different external format:

```ts
{
  version: 'named-joints/1',
  clock: { ms: 1200, origin: 'video-start', id: 'clip-a' },
  coordinates: { /* explicit canonical CoordinateSpace */ },
  joints: {
    leftWrist: { xy: [100, 220], depth: null, quality: 0.9, seen: 0.8, present: true },
    rightWrist: null
    // Known Z: depth: {value: 12, uncertainty: null}; it is a provider estimate.
  }
}
```

To replace a provider, implement `PoseSourceAdapter.toFrame(unknown)`, validate its
version and payload, map semantic names, declare coordinates/depth/clock explicitly,
and call `validateFrame`. Return an independent snapshot. The core never imports
the adapter. No Muse schema is invented: a future Muse adapter can target
`SkeletonFrame` through this same interface; Muse consumers can read semantic
`SkeletonPose` geometry. Cues/classification remain outside this package.

## Depth and calibration

`PassThroughDepthEstimator` preserves supplied canonical depths and provenance;
`TwoDimensionalDepthEstimator` discards Z explicitly. Both preserve original input
and share the same downstream pose contract. For future strategies, provide
calibration and previous pose explicitly in `DepthRequest`; store temporal state
in the caller. Baseline strategies do not use calibration or previous poses.

`BodyCalibration` includes per-bone positive length, optional known uncertainty
(otherwise null), and provenance (`manual-measurement`, `population-average`, or
`observed-estimate`). Units are meters, pixels, or body-units. Metric image use
additionally requires `imageScale: {projection: 'orthographic' | 'weak-perspective',
metersPerPixel, imageSize: {width, height}}`. The resolution must match. A single
scale assumes uniform camera scale across the subject/depth range. Normalization
does not supply metric calibration. Never infer user lengths from avatar meshes.

`solveBoneDepth` is an **experimental single-bone constraint helper**, not a
full-body estimator and not automatically used by either baseline strategy. It:

1. Corrects normalized image aspect ratio; requires matching Euclidean units, or
   explicit meters-per-pixel calibration to combine image XY with metric lengths.
2. Computes `deltaZ = ±sqrt(L² - deltaX² - deltaY²)`, ignoring image-relative Z.
3. Returns **both** signed candidates and `ambiguous` unless `priorDeltaZ` or a
   compatible earlier 3D `previousPose` supplies a nonzero sign. An explicit prior
   takes precedence. The prior is child minus parent in calibration units.
4. Reports `inconsistent` for projected length exceeding assumed length. Only
   negative roundoff within `1e-12 * L²` is treated as planar; other failures are
   not clamped away. Invalid/low-confidence endpoints and missing/incompatible
   calibration have distinct statuses. Invalid calibration schemas throw.
5. Flags near-planar solutions when `|deltaZ|/L < 0.05` and returns sensitivity
   `projectedLength/|deltaZ|`; null means unbounded at planar depth. Small length/XY
   errors can dominate here. Calibration/XY uncertainty is **not statistically
   fitted or propagated** by this helper; candidate values are conditional on the
   assumed length. Unknown depth uncertainty must remain null, never zero.

Previous-pose selection requires matching timeline, reflection state and units,
and a timestamp no later than the current frame. It uses a valid 3D bone's sign;
2D/zero priors leave ambiguity. Neither proportions nor this equation uniquely
determine front/back, absolute camera distance, camera pose, or a globally
consistent skeleton. The helper does not write candidate depths into poses.

## Usage and future integration

```ts
import { DanceSkeleton, NamedJointFixtureAdapter, normalizeBody,
  PassThroughDepthEstimator } from '@ojustdance/skeleton'

const adapter = new NamedJointFixtureAdapter()
const source = adapter.toFrame(externalPayload)
const result = new PassThroughDepthEstimator().reconstruct({ frame: source })
const skeleton = new DanceSkeleton()
const wrist = skeleton.getJoint(result.pose, 'leftWrist')
const edges = skeleton.validEdges(result.pose)

const normalized = normalizeBody(source) // requires usable hips and shoulders
const comparablePose = skeleton.constructPose(normalized.frame, normalized.originalFrame)
// Keep normalized.rootPosition / scale to recover scene movement.
```

- MediaPipe branch: select a person and coordinate array; supply timestamp,
  dimensions, mirror/depth policy; implement a new adapter if its format changes.
- Muse branch: consume versioned semantic frames/poses or implement an adapter;
  preserve unknown validity/depth. No network requests or cue queue are included.
- Renderer/retargeting branch: read valid edges/observed lengths and original root;
  map semantics to its own rig. Rotations, fixed rig proportions, mesh deformation,
  scoring, and IK are deliberately separate.

Team agreement is still needed on durable schema ownership/version negotiation,
timeline IDs and clip synchronization, nose vs. anatomical head landmarks, synthetic
neck/spine placement, confidence thresholds/unknown-quality policy, chosen mirror
semantics, future depth uncertainty models, and calibration sourcing. There is no
full-body optimization, perspective fitting, camera-calibration UI, smoothing,
interpolation, avatar loading or rig retargeting here.
