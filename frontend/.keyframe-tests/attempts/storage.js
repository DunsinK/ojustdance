import { ATTEMPT_LIMITS } from './contracts.js';
import { validateAttempt, validateEvaluation } from './validation.js';
import { encodeAttemptData } from './serialization.js';
async function database() {
    if (typeof indexedDB === 'undefined')
        throw new Error('Browser storage is unavailable. Download the recording to keep it.');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ojustdance-scoring-attempts', 1);
        let blocked = false;
        request.onupgradeneeded = () => {
            request.result.createObjectStore('attempts', { keyPath: 'id' });
            request.result.createObjectStore('summaries', { keyPath: 'id' });
            request.result.createObjectStore('evaluations', { keyPath: 'id' }).createIndex('attemptId', 'attemptId');
        };
        request.onerror = () => reject(new Error('Could not open attempt storage. Download a backup and check browser storage permissions.'));
        request.onblocked = () => { blocked = true; reject(new Error('Attempt storage is blocked by another tab. Close older tabs and retry.')); };
        request.onsuccess = () => {
            if (blocked) {
                request.result.close();
                return;
            }
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
    });
}
async function transaction(stores, mode, work) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let value;
            tx.oncomplete = () => resolve(value);
            tx.onabort = () => reject(new Error(tx.error?.name === 'ConstraintError'
                ? 'This recording or evaluation is already saved. The existing original was not changed.'
                : 'Attempt storage failed. It may be full; download your recording before leaving.'));
            try {
                work(tx, (result) => { value = result; });
            }
            catch (error) {
                tx.abort();
                reject(error);
            }
        });
    }
    finally {
        db.close();
    }
}
export async function saveAttempt(attempt) {
    validateAttempt(attempt);
    if (new TextEncoder().encode(encodeAttemptData(attempt)).byteLength > ATTEMPT_LIMITS.bytes)
        throw new Error('Attempt exceeds the 128 MB storage limit. Download a shorter recording.');
    const last = attempt.events.at(-1);
    const summary = {
        id: attempt.id, createdAt: attempt.createdAt, title: attempt.reference.chart.title,
        score: attempt.original.result.score, maxScore: attempt.original.result.maxScore,
        durationSec: last?.kind === 'finish' ? last.songTimeSec : attempt.original.result.timeSec,
        observations: attempt.events.filter((event) => event.kind === 'observation').length, recordingStatus: attempt.recordingStatus,
    };
    await transaction(['attempts', 'summaries'], 'readwrite', (tx) => {
        // add(), deliberately never put(): a replay/import cannot overwrite an original baseline.
        tx.objectStore('attempts').add(attempt);
        tx.objectStore('summaries').add(summary);
    });
}
export async function listAttempts() {
    return transaction(['summaries'], 'readonly', (tx, result) => {
        tx.objectStore('summaries').getAll().onsuccess = (event) => result(event.target.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
}
export async function readAttempt(id) {
    const attempt = await transaction(['attempts'], 'readonly', (tx, result) => {
        const request = tx.objectStore('attempts').get(id);
        request.onsuccess = () => result(request.result);
    });
    if (attempt === undefined)
        return null;
    validateAttempt(attempt);
    return attempt;
}
export async function saveEvaluation(evaluation) {
    validateEvaluation(evaluation);
    await transaction(['attempts', 'evaluations'], 'readwrite', (tx) => {
        const request = tx.objectStore('attempts').getKey(evaluation.attemptId);
        request.onsuccess = () => { if (request.result === undefined)
            tx.abort();
        else
            tx.objectStore('evaluations').add(evaluation); };
    });
}
export async function readEvaluations(attemptId) {
    const evaluations = await transaction(['evaluations'], 'readonly', (tx, result) => {
        const request = tx.objectStore('evaluations').index('attemptId').getAll(attemptId);
        request.onsuccess = () => result(request.result);
    });
    evaluations.forEach(validateEvaluation);
    return evaluations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function deleteAttempt(id) {
    await transaction(['attempts', 'summaries', 'evaluations'], 'readwrite', (tx) => {
        tx.objectStore('attempts').delete(id);
        tx.objectStore('summaries').delete(id);
        const cursor = tx.objectStore('evaluations').index('attemptId').openCursor(id);
        cursor.onsuccess = () => { if (cursor.result) {
            cursor.result.delete();
            cursor.result.continue();
        } };
    });
}
