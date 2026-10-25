import { DanceSkeleton } from '@ojustdance/skeleton';
import { CURRENT_SELECTION_ALGORITHM, frameId, THUMBNAIL_LIMITS } from './contracts.js';
// Semantic groups only. Bone connectivity continues to come from DanceSkeleton.
const GROUPS = {
    leftArm: ['leftShoulder', 'leftElbow', 'leftWrist'], rightArm: ['rightShoulder', 'rightElbow', 'rightWrist'],
    leftLeg: ['leftHip', 'leftKnee', 'leftAnkle'], rightLeg: ['rightHip', 'rightKnee', 'rightAnkle'],
    torso: ['pelvis', 'chest', 'head'],
};
const skeleton = new DanceSkeleton();
const PARTS = [...Object.keys(GROUPS), 'travel'];
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}
function distance(a, b) {
    if (a.length !== b.length || !a.length)
        return Infinity;
    // A wrist or ankle matters even when the other joints of its chain barely move.
    let largest = 0;
    for (let axis = 0; axis < a.length; axis += 2)
        largest = Math.max(largest, Math.hypot(a[axis] - b[axis], a[axis + 1] - b[axis + 1]));
    return largest;
}
function featureFrame(sample) {
    const pose = skeleton.constructPose(sample.frame);
    const root = pose.joints.pelvis.position, chest = pose.joints.chest.position;
    if (!root || !chest)
        return null;
    const torsoScale = Math.hypot(chest.x - root.x, chest.y - root.y);
    if (!Number.isFinite(torsoScale) || torsoScale < 1e-6)
        return null;
    const groups = {};
    for (const [part, names] of Object.entries(GROUPS)) {
        const joints = names.map((name) => pose.joints[name]);
        // A missing point is never replaced by zero; that body part simply has no feature.
        if (joints.some((joint) => !joint.valid || !joint.position))
            continue;
        groups[part] = joints.flatMap((joint) => [(joint.position.x - root.x) / torsoScale, (joint.position.y - root.y) / torsoScale]);
    }
    const observed = Object.values(pose.joints).filter((joint) => joint.valid && !joint.derived);
    const quality = observed.length ? observed.reduce((sum, joint) => sum + (joint.visibility ?? joint.confidence ?? 0.5), 0) / observed.length : 0;
    return { sample, groups, root, torsoScale, quality };
}
/** Low-pass filtering belongs to this offline selector, never to the deterministic skeleton core. */
function smoothRun(run) {
    const scale = median(run.map((frame) => frame.torsoScale));
    return run.map((frame, index) => {
        const neighbors = run.slice(Math.max(0, index - 1), Math.min(run.length, index + 2));
        const groups = {};
        for (const part of PARTS) {
            const points = neighbors.flatMap((neighbor) => neighbor.groups[part] ? [neighbor.groups[part]] : []);
            if (frame.groups[part] && points.length)
                groups[part] = frame.groups[part].map((_, axis) => median(points.map((point) => point[axis])));
        }
        // Image root travel is retained separately from centered limb geometry.
        groups.travel = [median(neighbors.map((neighbor) => neighbor.root.x)) / scale, median(neighbors.map((neighbor) => neighbor.root.y)) / scale];
        return { ...frame, groups };
    });
}
/** Simplify the time/pose curve. Extrema and direction changes survive; static duplicates do not. */
function significantVertices(features, part, tolerance) {
    const vertices = new Set([0, features.length - 1]);
    // Bounded windows keep processing responsive without adding arbitrary rapid milestones.
    // Shared endpoints preserve continuity; an unchanged window still produces no event.
    let windowStart = 0;
    const pending = [];
    for (let index = 1; index < features.length; index++) {
        if (features[index].sample.sourceTimeSec - features[windowStart].sample.sourceTimeSec >= 4 || index === features.length - 1) {
            vertices.add(index);
            pending.push([windowStart, index]);
            windowStart = index;
        }
    }
    while (pending.length) {
        const [first, last] = pending.pop();
        const a = features[first], b = features[last];
        const duration = b.sample.sourceTimeSec - a.sample.sourceTimeSec;
        if (duration <= 0)
            continue;
        let greatestError = tolerance, split = -1;
        for (let index = first + 1; index < last; index++) {
            const fraction = (features[index].sample.sourceTimeSec - a.sample.sourceTimeSec) / duration;
            const predicted = a.groups[part].map((value, axis) => value + fraction * (b.groups[part][axis] - value));
            const error = distance(features[index].groups[part], predicted);
            if (error > greatestError) {
                greatestError = error;
                split = index;
            }
        }
        if (split !== -1) {
            vertices.add(split);
            pending.push([first, split], [split, last]);
        }
    }
    return [...vertices].sort((a, b) => a - b);
}
function findEvents(run) {
    const result = [];
    for (const part of PARTS) {
        // Tracking gaps in an individual limb also break its curve.
        let start = 0;
        while (start < run.length) {
            while (start < run.length && !run[start].groups[part])
                start++;
            let end = start;
            while (end < run.length && run[end].groups[part])
                end++;
            const features = run.slice(start, end);
            start = Math.max(end, start + 1);
            if (features.length < 3)
                continue;
            // Local curvature estimates jitter without mistaking sustained speed for noise.
            const residuals = features.slice(1, -1).map((frame, index) => {
                const before = features[index], after = features[index + 2];
                const fraction = (frame.sample.sourceTimeSec - before.sample.sourceTimeSec) / (after.sample.sourceTimeSec - before.sample.sourceTimeSec);
                return distance(frame.groups[part], before.groups[part].map((value, axis) => value + fraction * (after.groups[part][axis] - value)));
            });
            const noise = Math.min(0.04, median(residuals));
            const tolerance = Math.max(0.045, noise * 2.5);
            const vertices = significantVertices(features, part, tolerance);
            for (let index = 1; index < vertices.length; index++) {
                const first = vertices[index - 1], last = vertices[index];
                const strength = distance(features[first].groups[part], features[last].groups[part]);
                if (strength < Math.max(part === 'travel' ? 0.28 : 0.14, noise * 4))
                    continue;
                // Activation is the onset, while the image is a later representative pose.
                let onset = first;
                const onsetDistance = Math.max(0.025, strength * 0.08);
                while (onset + 1 < last && distance(features[first].groups[part], features[onset + 1].groups[part]) < onsetDistance)
                    onset++;
                if (features[last].sample.sourceTimeSec - features[onset].sample.sourceTimeSec < 0.1)
                    continue;
                result.push({ start: onset, end: last, strength, part, features });
            }
        }
    }
    return result;
}
function coordinateKey(frame) {
    const c = frame.coordinates;
    return JSON.stringify([c.kind, c.units, c.origin, c.axes, c.mirrored, c.imageSize]);
}
function prepareFeatureRuns(samples) {
    if (samples.length > THUMBNAIL_LIMITS.samples)
        throw new Error('Too many pose samples; use a shorter reference video');
    let sourceWidth = 0, sourceHeight = 0;
    const runs = [];
    let run = [];
    let previous = null;
    const ordered = [...samples].sort((a, b) => a.sourceTimeSec - b.sourceTimeSec || a.chartTimeSec - b.chartTimeSec);
    const typicalStep = median(ordered.slice(1).flatMap((sample, index) => {
        const step = sample.sourceTimeSec - ordered[index].sourceTimeSec;
        return step > 0 && step <= 1 && sample.segmentId === ordered[index].segmentId ? [step] : [];
    }));
    const gapLimit = Math.max(0.04, typicalStep * 1.8);
    for (const sample of ordered) {
        if (!Number.isFinite(sample.sourceTimeSec) || sample.sourceTimeSec < 0 || sample.sourceTimeSec > THUMBNAIL_LIMITS.sourceDurationSec || !Number.isFinite(sample.chartTimeSec))
            throw new Error('Motion sample timestamps must be finite reference/chart seconds');
        if (sample.frame.coordinates.kind !== 'image' || sample.frame.coordinates.units !== 'pixels' || sample.frame.coordinates.origin !== 'image-top-left' || sample.frame.coordinates.mirrored)
            throw new Error('Keyframe selection requires original, unmirrored canonical pixel observations');
        const feature = featureFrame(sample);
        const gap = previous ? sample.sourceTimeSec - previous.sourceTimeSec : 0;
        const discontinuity = previous && (previous.segmentId !== sample.segmentId || coordinateKey(previous.frame) !== coordinateKey(sample.frame) || gap > gapLimit || gap <= 0);
        // A very large camera cut/root teleport is not a dance step.
        const previousFeature = run.at(-1);
        const cut = feature && previousFeature && Math.hypot(feature.root.x - previousFeature.root.x, feature.root.y - previousFeature.root.y) / feature.torsoScale > 2.5;
        if (!feature || discontinuity || cut) {
            if (run.length >= 3)
                runs.push(run);
            run = [];
        }
        if (feature)
            run.push(feature);
        previous = sample;
        if (!sourceWidth) {
            sourceWidth = sample.frame.coordinates.imageSize.width;
            sourceHeight = sample.frame.coordinates.imageSize.height;
        }
    }
    if (run.length >= 3)
        runs.push(run);
    return { runs: runs.map(smoothRun), sourceWidth, sourceHeight };
}
export function selectMotionKeyframes(samples) {
    const { runs, sourceWidth, sourceHeight } = prepareFeatureRuns(samples);
    const result = { schemaVersion: 'motion-thumbnails/1', algorithm: CURRENT_SELECTION_ALGORITHM, clock: 'reference-video-seconds', sourceWidth, sourceHeight, cues: [], frames: {} };
    const events = runs.flatMap(findEvents).sort((a, b) => a.features[a.end].sample.sourceTimeSec - b.features[b.end].sample.sourceTimeSec || b.strength - a.strength);
    const merged = [];
    for (const event of events) {
        const first = event.features[event.start], last = event.features[event.end];
        const startTime = first.sample.sourceTimeSec, endTime = last.sample.sourceTimeSec;
        const candidates = event.features.slice(Math.max(event.start, event.end - 1), Math.min(event.features.length, event.end + 2))
            // Sharpness must not move a knee lift to a different phase of a quick step.
            .filter((frame) => Math.abs(frame.sample.sourceTimeSec - endTime) <= 0.08 && distance(frame.groups[event.part], last.groups[event.part]) <= 0.06)
            .sort((a, b) => b.quality - a.quality || Math.abs(a.sample.sourceTimeSec - endTime) - Math.abs(b.sample.sourceTimeSec - endTime))
            .slice(0, 3).map((frame) => frame.sample.sourceTimeSec);
        const cue = {
            id: `motion-${Math.round(startTime * 1000000)}-${Math.round(endTime * 1000000)}`,
            startTimeSec: startTime, endTimeSec: endTime, thumbnailTimeSec: endTime,
            presentation: event.strength >= 0.6 || event.part === 'travel' ? 'pair' : 'pose',
            frameIds: [], parts: [event.part], candidateTimesSec: candidates.length ? candidates : [endTime],
        };
        const preceding = merged.at(-1);
        // Combine matching target moments, rather than all moves that happen to start nearby.
        if (preceding && endTime - preceding.groupTime < 0.18) {
            preceding.cue.parts = [...new Set([...preceding.cue.parts, event.part])];
            preceding.cue.endTimeSec = Math.max(preceding.cue.endTimeSec, endTime);
            if (event.strength > preceding.strength) {
                preceding.cue.thumbnailTimeSec = endTime;
                preceding.cue.candidateTimesSec = cue.candidateTimesSec;
                preceding.cue.presentation = cue.presentation;
                preceding.strength = event.strength;
            }
        }
        else
            merged.push({ cue, strength: event.strength, groupTime: endTime });
    }
    // Keep the strongest events if a long/noisy clip exceeds the bounded cache budget.
const selected=[]; for(const candidate of [...merged].sort((a,b)=>b.strength-a.strength)){if(selected.some(kept=>Math.abs(kept.cue.thumbnailTimeSec-candidate.cue.thumbnailTimeSec)<0.22-1e-6))continue;selected.push(candidate);if(selected.length>=256)break;}
    let previousTarget = -Infinity;
    result.cues = selected.sort((a, b) => a.cue.thumbnailTimeSec - b.cue.thumbnailTimeSec).flatMap(({ cue }) => {
        // Present consecutive target poses as consecutive intervals. Parallel body-part
        // motions can begin together; their cards still need distinct arrival times.
        const startTimeSec = Math.max(cue.startTimeSec, previousTarget);
        previousTarget = cue.thumbnailTimeSec;
        if (startTimeSec >= cue.thumbnailTimeSec - 0.001)
            return [];
        const candidateTimesSec = cue.candidateTimesSec.filter((time) => time > startTimeSec);
        const start = { ...cue, startTimeSec, candidateTimesSec: candidateTimesSec.length ? candidateTimesSec : [cue.thumbnailTimeSec],
            id: `motion-${Math.round(startTimeSec * 1000000)}-${Math.round(cue.thumbnailTimeSec * 1000000)}` };
        return [{ ...start, frameIds: start.presentation === 'pair' ? [frameId(startTimeSec), frameId(start.thumbnailTimeSec)] : [frameId(start.thumbnailTimeSec)] }];
    });
    return result;
}
/**
 * Audit how well selected measured poses reconstruct the observed XY trajectory.
 * This is a geometry diagnostic, not a claim to understand choreography. Each
 * body-part tracking run is evaluated separately; gaps are never reconstructed.
 */
export function evaluateMotionSelection(samples, plan) {
    const { runs } = prepareFeatureRuns(samples);
    const toleranceTorsoUnits = 0.18;
    const targets = plan.cues.map((cue) => cue.thumbnailTimeSec).sort((a, b) => a - b);
    const curve = [];
    let movingPartSamples = 0, coveredMovingPartSamples = 0, totalError = 0, maxMotionError = 0;
    for (const [runId, run] of runs.entries()) {
        const errors = run.map((frame) => ({ sourceTimeSec: frame.sample.sourceTimeSec, error: 0, moving: false, runId }));
        for (const part of PARTS) {
            let begin = 0;
            while (begin < run.length) {
                while (begin < run.length && !run[begin].groups[part])
                    begin++;
                let end = begin;
                while (end < run.length && run[end].groups[part])
                    end++;
                const features = run.slice(begin, end);
                const first = features[0];
                if (features.length < 3 || !first) {
                    begin = Math.max(end, begin + 1);
                    continue;
                }
                // The run's first observed pose is a baseline. Every other anchor must be
                // an actual selected thumbnail, rather than an invented endpoint.
                const anchors = [first];
                for (const target of targets) {
                    if (target <= first.sample.sourceTimeSec || target > features.at(-1).sample.sourceTimeSec)
                        continue;
                    const closest = features.reduce((best, frame) => Math.abs(frame.sample.sourceTimeSec - target) < Math.abs(best.sample.sourceTimeSec - target) ? frame : best);
                    if (Math.abs(closest.sample.sourceTimeSec - target) <= 0.08 && anchors.at(-1) !== closest)
                        anchors.push(closest);
                }
                let anchorIndex = 0;
                for (let index = 0; index < features.length; index++) {
                    const frame = features[index], time = frame.sample.sourceTimeSec;
                    const previous = features[Math.max(0, index - 2)], next = features[Math.min(features.length - 1, index + 2)];
                    // Ignore stationary samples so long holds do not inflate motion coverage.
                    if (distance(previous.groups[part], next.groups[part]) <= 0.04)
                        continue;
                    while (anchorIndex + 1 < anchors.length && anchors[anchorIndex + 1].sample.sourceTimeSec <= time)
                        anchorIndex++;
                    const a = anchors[anchorIndex], b = anchors[anchorIndex + 1] ?? a;
                    const duration = b.sample.sourceTimeSec - a.sample.sourceTimeSec;
                    const fraction = duration > 0 ? Math.max(0, Math.min(1, (time - a.sample.sourceTimeSec) / duration)) : 0;
                    const predicted = a.groups[part].map((value, axis) => value + fraction * (b.groups[part][axis] - value));
                    const error = distance(frame.groups[part], predicted);
                    movingPartSamples++;
                    totalError += error;
                    maxMotionError = Math.max(maxMotionError, error);
                    if (error <= toleranceTorsoUnits)
                        coveredMovingPartSamples++;
                    errors[begin + index].error = Math.max(errors[begin + index].error, error);
                    errors[begin + index].moving = true;
                }
                begin = Math.max(end, begin + 1);
            }
        }
        curve.push(...errors);
    }
    // Preserve local peaks while keeping browser diagnostics/export bounded.
    const compact = [];
    const bucketSize = Math.max(1, Math.ceil(curve.length / 600));
    for (let index = 0; index < curve.length; index += bucketSize)
        compact.push(curve.slice(index, index + bucketSize).reduce((peak, point) => point.error > peak.error ? point : peak));
    return { schemaVersion: 'motion-selection-diagnostics/1', sampleCount: samples.length,
        usableRootSamples: runs.reduce((count, run) => count + run.length, 0), movingPartSamples, coveredMovingPartSamples,
        coverageFraction: movingPartSamples ? coveredMovingPartSamples / movingPartSamples : null,
        meanMotionError: movingPartSamples ? totalError / movingPartSamples : 0, maxMotionError, toleranceTorsoUnits, curve: compact };
}
