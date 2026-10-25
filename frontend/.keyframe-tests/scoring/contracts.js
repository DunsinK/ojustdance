export const DEFAULT_SCORING_CONFIG = Object.freeze({
    schemaVersion: 'dance-scoring/3', timingToleranceMs: 50, sampleHz: 20, blockSize: 4,
    processingDeadlineMs: 200, maximumSampleGapMs: 100, minimumCoverage: 0.65, comboWindowSec: 0.5,
    motionWindowSec: 0.2,
});
export function scoringConfig(options = {}) {
    const config = { ...DEFAULT_SCORING_CONFIG, ...options };
    if (config.schemaVersion !== 'dance-scoring/3' || !Number.isFinite(config.timingToleranceMs)
        || config.timingToleranceMs < 30 || config.timingToleranceMs > 70)
        throw new Error('Scoring timing tolerance must be 30–70 ms');
    if (config.sampleHz !== 20 || config.blockSize !== 4 || config.processingDeadlineMs !== 200
        || config.maximumSampleGapMs !== 100 || config.minimumCoverage !== 0.65 || config.comboWindowSec !== 0.5
        || config.motionWindowSec !== 0.2)
        throw new Error('Unsupported dance-scoring/3 policy; change its version before changing fixed scoring rules');
    return Object.freeze(config);
}
