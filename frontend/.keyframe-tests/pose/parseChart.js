import { validateMotionThumbnails } from '../keyframes/validation.js';
function isSample(value) {
    if (!value || typeof value !== "object")
        return false;
    const s = value;
    return typeof s.t === "number" && Array.isArray(s.landmarks);
}
/** Normalize API / stored JSON into a ChartDocument the matcher can use. */
export function parseChartDocument(raw) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") {
        throw new Error("Chart payload is empty");
    }
    const record = doc;
    const samplesRaw = record.samples;
    if (!Array.isArray(samplesRaw) || samplesRaw.length === 0) {
        throw new Error("Chart has no pose samples");
    }
    const samples = samplesRaw.filter(isSample).sort((a, b) => a.t - b.t);
    if (!samples.length) {
        throw new Error("Chart samples are invalid");
    }
    const durationSec = typeof record.durationSec === "number"
        ? record.durationSec
        : samples[samples.length - 1].t;
    if (record.motionThumbnails !== undefined)
        validateMotionThumbnails(record.motionThumbnails);
    return {
        version: 1,
        motionThumbnails: record.motionThumbnails,
        sampleRateHz: typeof record.sampleRateHz === "number" ? record.sampleRateHz : 15,
        durationSec,
        title: typeof record.title === "string" ? record.title : "Untitled",
        difficulty: record.difficulty === "normal" || record.difficulty === "hard"
            ? record.difficulty
            : "easy",
        model: record.model === "full" || record.model === "heavy" ? record.model : "lite",
        recordedAt: typeof record.recordedAt === "string"
            ? record.recordedAt
            : new Date().toISOString(),
        normalization: {
            origin: "hip_midpoint",
            scale: "torso_length",
            axes: ["x", "y", "z", "visibility"],
        },
        landmarkNames: Array.isArray(record.landmarkNames)
            ? record.landmarkNames
            : [],
        segments: Array.isArray(record.segments)
            ? record.segments
            : [],
        samples,
    };
}
