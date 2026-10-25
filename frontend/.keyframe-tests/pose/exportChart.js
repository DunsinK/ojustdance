import { validateMotionThumbnails } from '../keyframes/validation.js';
import { LANDMARK_NAMES } from "./landmarks.js";
export function timelineDuration(segments) {
    if (!segments.length)
        return 0;
    return Math.max(...segments.map((s) => s.endSec));
}
export function flattenSamples(segments) {
    return segments
        .flatMap((s) => s.samples)
        .sort((a, b) => a.t - b.t);
}
/** Pack segments back-to-back from t=0 (removes gaps after deletes). */
export function closeGaps(segments) {
    let cursor = 0;
    return segments
        .slice()
        .sort((a, b) => a.startSec - b.startSec)
        .map((seg) => {
        const duration = Math.max(0, seg.endSec - seg.startSec);
        const startSec = cursor;
        const endSec = cursor + duration;
        const samples = seg.samples.map((sample) => ({
            ...sample,
            t: Number((sample.t - seg.startSec + startSec).toFixed(4)),
        }));
        cursor = endSec;
        return { ...seg, startSec, endSec, samples };
    });
}
export function buildChartDocument(opts) {
    const samples = flattenSamples(opts.segments);
    if (opts.motionThumbnails)
        validateMotionThumbnails(opts.motionThumbnails);
    const durationSec = timelineDuration(opts.segments);
    return {
        version: 1,
        motionThumbnails: opts.motionThumbnails,
        sampleRateHz: opts.sampleRateHz,
        durationSec: Number(durationSec.toFixed(3)),
        title: opts.title || "Untitled chart",
        difficulty: opts.difficulty,
        model: opts.model,
        recordedAt: new Date().toISOString(),
        normalization: {
            origin: "hip_midpoint",
            scale: "torso_length",
            axes: ["x", "y", "z", "visibility"],
        },
        landmarkNames: [...LANDMARK_NAMES],
        segments: opts.segments.map((s) => ({
            id: s.id,
            startSec: Number(s.startSec.toFixed(3)),
            endSec: Number(s.endSec.toFixed(3)),
            sampleCount: s.samples.length,
        })),
        samples,
    };
}
export function downloadChartJson(doc) {
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = doc.title.replace(/[^\w.-]+/g, "-").slice(0, 40) || "chart";
    a.href = url;
    a.download = `${safe}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
