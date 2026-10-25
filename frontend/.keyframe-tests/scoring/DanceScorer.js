import { scoringConfig } from './contracts.js';
import { extractPoseFeatures, hasReferenceEvidence } from './features.js';
import { alignBlock } from './alignment.js';
const EMPTY = { timeSec: 0, accuracy: 0, pointCredit: 0, form: 0, motion: null, timing: 0, coverage: 0, offsetMs: null, label: '…' };
/** Per-attempt temporal state lives here, never inside the canonical skeleton. */
export class DanceScorer {
    config;
    reference;
    observations = [];
    nextIndex = 0;
    anchor = null;
    awardedSeconds = 0;
    evaluatedSeconds = 0;
    judgedSeconds = 0;
    measuredAccuracySeconds = 0;
    coverageSeconds = 0;
    trackingMisses = 0;
    lastClock = -Infinity;
    lastCapture = -Infinity;
    latest = EMPTY;
    combo = 0;
    maxCombo = 0;
    comboBucket = 0;
    comboValue = 0;
    comboWeight = 0;
    finished = false;
    constructor(reference, options = {}) {
        if (reference.schemaVersion !== 'dance-score-reference/2')
            throw new Error('Unsupported scoring reference version');
        this.config = scoringConfig(options);
        this.reference = reference;
    }
    /** Use a new instance for restart/replay. Late, duplicate, and stale deliveries cannot revise awarded points. */
    addObservation(observation) {
        const { songTimeSec, receivedAtSongTimeSec, frame } = observation;
        if (this.finished || !Number.isFinite(songTimeSec) || !Number.isFinite(receivedAtSongTimeSec) || songTimeSec < 0
            || songTimeSec <= this.lastCapture || songTimeSec > receivedAtSongTimeSec + 0.001
            || receivedAtSongTimeSec - songTimeSec > this.config.processingDeadlineMs / 1000 + 1e-7)
            return false;
        this.lastCapture = songTimeSec;
        const earliest = this.reference.opportunities[this.nextIndex]?.timeSec ?? this.reference.durationSec;
        if (songTimeSec < earliest - this.config.timingToleranceMs / 1000 - this.config.maximumSampleGapMs / 1000 - this.config.motionWindowSec)
            return false;
        let pose = null;
        if (frame) {
            try {
                pose = extractPoseFeatures(frame);
            }
            catch { /* Bad provider metadata is unavailable evidence, never a fabricated pose. */ }
        }
        this.observations.push({ timeSec: songTimeSec, pose });
        if (this.observations.length > 512)
            this.observations.splice(0, this.observations.length - 512);
        return true;
    }
    advance(songTimeSec) {
        if (!Number.isFinite(songTimeSec) || songTimeSec < 0)
            throw new Error('Scoring requires finite song seconds');
        if (this.finished || songTimeSec <= this.lastClock)
            return this.snapshot();
        this.lastClock = songTimeSec;
        while (this.nextIndex < this.reference.opportunities.length) {
            const block = this.reference.opportunities.slice(this.nextIndex, this.nextIndex + this.config.blockSize);
            const deadline = block.at(-1).timeSec + (this.config.timingToleranceMs + this.config.processingDeadlineMs) / 1000;
            if (songTimeSec + 1e-7 < deadline)
                break;
            this.commit(block);
        }
        return this.snapshot();
    }
    /** Early exit keeps the full chart denominator; quitting early cannot produce a full score. */
    finish(stopSongTimeSec = this.reference.durationSec) {
        if (!Number.isFinite(stopSongTimeSec) || stopSongTimeSec < 0)
            throw new Error('Invalid scoring finish time');
        if (this.finished)
            return this.snapshot();
        while (this.nextIndex < this.reference.opportunities.length) {
            const block = this.reference.opportunities.slice(this.nextIndex, this.nextIndex + this.config.blockSize).filter((point) => point.timeSec <= stopSongTimeSec);
            if (!block.length)
                break;
            this.commit(block);
        }
        this.closeComboWindow();
        this.finished = true;
        return this.snapshot();
    }
    snapshot() {
        return { ...this.latest, schemaVersion: 'dance-score/3', maxScore: 10000,
            score: this.reference.scorableDurationSec ? Math.min(10000, 10000 * this.awardedSeconds / this.reference.scorableDurationSec) : 0,
            combo: this.combo, maxCombo: this.maxCombo,
            averageAccuracy: this.judgedSeconds ? this.measuredAccuracySeconds / this.judgedSeconds : 0,
            trackingCoverage: this.evaluatedSeconds ? this.coverageSeconds / this.evaluatedSeconds : 0,
            judgedCoverage: this.evaluatedSeconds ? this.judgedSeconds / this.evaluatedSeconds : 0,
            trackingMisses: this.trackingMisses, processedOpportunities: this.nextIndex };
    }
    closeComboWindow() {
        if (this.comboWeight > 0) {
            this.combo = this.comboValue / this.comboWeight >= 0.7 ? this.combo + 1 : 0;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
        }
        this.comboValue = 0;
        this.comboWeight = 0;
    }
    commit(block) {
        // Split around unavailable reference intervals so DTW never bridges a tracking gap.
        let begin = 0;
        while (begin < block.length) {
            if (!hasReferenceEvidence(block[begin].pose)) {
                this.anchor = null;
                this.latest = { ...EMPTY, timeSec: block[begin].timeSec, label: 'NO REFERENCE' };
                this.nextIndex++;
                begin++;
                continue;
            }
            let end = begin + 1;
            while (end < block.length && hasReferenceEvidence(block[end].pose)
                && block[end].pose.continuity === block[end - 1].pose.continuity)
                end++;
            if (this.anchor && this.anchor.reference.continuity !== block[begin].pose.continuity)
                this.anchor = null;
            const history = this.reference.opportunities.slice(Math.max(0, this.nextIndex - Math.ceil(this.config.motionWindowSec * this.config.sampleHz) - 1), this.nextIndex);
            const aligned = alignBlock(block.slice(begin, end), this.observations, this.config, this.anchor, history);
            aligned.forEach((entry, index) => {
                const point = block[begin + index];
                const bucket = Math.floor((point.timeSec + 1e-9) / this.config.comboWindowSec);
                if (bucket !== this.comboBucket) {
                    this.closeComboWindow();
                    this.comboBucket = bucket;
                }
                this.latest = entry.judgment;
                this.anchor = entry.anchor;
                this.awardedSeconds += point.durationSec * entry.judgment.pointCredit;
                this.evaluatedSeconds += point.durationSec;
                this.coverageSeconds += point.durationSec * entry.judgment.coverage;
                if (entry.judgment.label !== 'TRACKING') {
                    this.judgedSeconds += point.durationSec;
                    this.measuredAccuracySeconds += point.durationSec * entry.judgment.accuracy;
                }
                this.comboValue += point.durationSec * entry.judgment.pointCredit;
                this.comboWeight += point.durationSec;
                if (entry.judgment.label === 'TRACKING')
                    this.trackingMisses++;
                this.nextIndex++;
            });
            begin = end;
        }
        const keepFrom = (this.reference.opportunities[this.nextIndex]?.timeSec ?? this.reference.durationSec)
            - this.config.timingToleranceMs / 1000 - this.config.maximumSampleGapMs / 1000 - this.config.motionWindowSec;
        // Retain one bracketing observation for interpolation, not an unbounded history.
        const firstRecent = this.observations.findIndex((point) => point.timeSec >= keepFrom);
        if (firstRecent > 1)
            this.observations.splice(0, firstRecent - 1);
    }
}
