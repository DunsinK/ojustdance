export function canonicalMotionSamples(segments) {
    return segments.flatMap((segment) => segment.samples.flatMap((sample) => sample.canonicalFrame ? [{
            chartTimeSec: sample.t, sourceTimeSec: sample.sourceTimeSec ?? sample.t,
            segmentId: segment.id, frame: sample.canonicalFrame,
        }] : []));
}
