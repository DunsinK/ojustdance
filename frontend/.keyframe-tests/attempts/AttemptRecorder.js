import { ATTEMPT_LIMITS } from './contracts.js';
import { encodeAttemptData } from './serialization.js';
/** Records scorer calls, not video. Call order and delivery times are part of the experiment. */
export class AttemptRecorder {
    events = [];
    trace = [];
    observationCount = 0;
    bytes = 0;
    exceeded = false;
    sealed = null;
    reference;
    policy;
    metadata;
    constructor(metadata, chart, options, policy) {
        this.metadata = { ...metadata };
        // Images/object URLs are unrelated to scoring and must not become recording dependencies.
        const { motionThumbnails: _thumbnails, ...scoringChart } = chart;
        void _thumbnails;
        this.reference = structuredClone({ chart: scoringChart, options });
        this.policy = structuredClone(policy);
        this.bytes = encodeAttemptData(this.reference).length;
    }
    observe(observation, originallyAccepted) {
        this.append({ kind: 'observation', observation, originallyAccepted });
    }
    advance(songTimeSec, result) {
        if (this.sealed)
            return;
        this.append({ kind: 'advance', songTimeSec });
        if (this.trace.at(-1)?.result.processedOpportunities !== result.processedOpportunities)
            this.addTrace(songTimeSec, result);
    }
    finish(songTimeSec, result) {
        if (this.sealed)
            return structuredClone(this.sealed);
        this.append({ kind: 'finish', songTimeSec });
        this.addTrace(songTimeSec, result);
        this.sealed = {
            schemaVersion: 'dance-attempt/1', id: this.metadata.id, createdAt: this.metadata.createdAt, mode: this.metadata.mode,
            recordingStatus: this.exceeded ? 'limit-exceeded' : 'complete', reference: this.reference, events: this.events,
            original: { implementationId: this.metadata.implementationId, policy: this.policy, result: structuredClone(result), trace: this.trace },
        };
        return structuredClone(this.sealed);
    }
    addTrace(songTimeSec, result) {
        if (this.trace.length < ATTEMPT_LIMITS.trace)
            this.trace.push({ songTimeSec: Math.min(songTimeSec, this.reference.options.durationSec ?? this.reference.chart.durationSec), result: structuredClone(result) });
    }
    append(event) {
        if (this.sealed || this.exceeded)
            return;
        const length = encodeAttemptData(event).length;
        if (this.events.length >= ATTEMPT_LIMITS.events - 1 || this.bytes + length > ATTEMPT_LIMITS.bytes * 0.85
            || (event.kind === 'observation' && this.observationCount >= ATTEMPT_LIMITS.observations)) {
            this.exceeded = true;
            return;
        }
        this.events.push(structuredClone(event));
        this.bytes += length;
        if (event.kind === 'observation')
            this.observationCount++;
    }
}
