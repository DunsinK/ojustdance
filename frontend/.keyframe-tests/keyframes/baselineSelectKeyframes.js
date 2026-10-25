import { DanceSkeleton } from '@ojustdance/skeleton';
import { frameId, THUMBNAIL_LIMITS } from './contracts.js';
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
    return Math.hypot(...a.map((value, index) => value - b[index])) / Math.sqrt(a.length / 2);
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
    // Bounded four-second windows keep curve simplification responsive on long/noisy clips.
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
            const adjacent = features.slice(1).map((frame, index) => distance(frame.groups[part], features[index].groups[part]));
            // Adaptive tracking-noise floor, bounded so continuous movement is not all dismissed as noise.
            const noise = Math.min(0.07, median(adjacent) * 0.4);
            const tolerance = Math.max(0.08, noise * 3);
            const vertices = significantVertices(features, part, tolerance);
            for (let index = 1; index < vertices.length; index++) {
                const first = vertices[index - 1], last = vertices[index];
                const strength = distance(features[first].groups[part], features[last].groups[part]);
                if (strength < Math.max(part === 'travel' ? 0.28 : 0.24, noise * 5))
                    continue;
                // Activation is the onset, while the image is a later representative pose.
                let onset = first;
                const onsetDistance = Math.max(0.045, strength * 0.12);
                while (onset + 1 < last && distance(features[first].groups[part], features[onset + 1].groups[part]) < onsetDistance)
                    onset++;
                if (features[last].sample.sourceTimeSec - features[onset].sample.sourceTimeSec < 0.12)
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
export function selectMotionKeyframes(samples) {
    if (samples.length > THUMBNAIL_LIMITS.samples)
        throw new Error('Too many pose samples; use a shorter reference video');
    const result = { schemaVersion: 'motion-thumbnails/1', algorithm: 'canonical-pose-events/1', clock: 'reference-video-seconds', sourceWidth: 0, sourceHeight: 0, cues: [], frames: {} };
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
        if (!result.sourceWidth) {
            result.sourceWidth = sample.frame.coordinates.imageSize.width;
            result.sourceHeight = sample.frame.coordinates.imageSize.height;
        }
    }
    if (run.length >= 3)
        runs.push(run);
    const events = runs.flatMap((current) => findEvents(smoothRun(current))).sort((a, b) => a.features[a.start].sample.sourceTimeSec - b.features[b.start].sample.sourceTimeSec);
    const merged = [];
    for (const event of events) {
        const first = event.features[event.start], last = event.features[event.end];
        const startTime = first.sample.sourceTimeSec, endTime = last.sample.sourceTimeSec;
        const candidates = event.features.slice(Math.max(event.start, event.end - 2), Math.min(event.features.length, event.end + 2))
            .filter((frame) => Math.abs(frame.sample.sourceTimeSec - endTime) <= 0.2)
            .sort((a, b) => b.quality - a.quality || Math.abs(a.sample.sourceTimeSec - endTime) - Math.abs(b.sample.sourceTimeSec - endTime))
            .slice(0, 3).map((frame) => frame.sample.sourceTimeSec);
        const cue = {
            id: `motion-${Math.round(startTime * 1000000)}-${Math.round(endTime * 1000000)}`,
            startTimeSec: startTime, endTimeSec: endTime, thumbnailTimeSec: endTime,
            presentation: event.strength >= 0.6 || event.part === 'travel' ? 'pair' : 'pose',
            frameIds: [], parts: [event.part], candidateTimesSec: candidates.length ? candidates : [endTime],
        };
        const preceding = merged.at(-1);
        // Combine simultaneous/very close body-part events into one readable queue card.
        if (preceding && startTime - preceding.cue.startTimeSec < 0.7) {
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
            merged.push({ cue, strength: event.strength });
    }
    // Keep the strongest events if a long/noisy clip exceeds the bounded cache budget.
    const selected = merged.length > THUMBNAIL_LIMITS.cues ? [...merged].sort((a, b) => b.strength - a.strength).slice(0, THUMBNAIL_LIMITS.cues) : merged;
    result.cues = selected.map(({ cue }) => ({ ...cue, frameIds: cue.presentation === 'pair' ? [frameId(cue.startTimeSec), frameId(cue.thumbnailTimeSec)] : [frameId(cue.thumbnailTimeSec)] })).sort((a, b) => a.startTimeSec - b.startTimeSec);
    return result;
}
