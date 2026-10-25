export function thumbnailPosition(cueStartSec, mediaTimeSec, leadInSec, width, targetX = 70) {
    const speed = Math.max(1, width - targetX - 50) / Math.max(0.5, leadInSec);
    return targetX + (cueStartSec - mediaTimeSec) * speed;
}
export function thumbnailState(cue, mediaTimeSec, leadInSec) {
    if (mediaTimeSec < cue.startTimeSec - leadInSec)
        return 'hidden';
    if (mediaTimeSec < cue.startTimeSec)
        return 'upcoming';
    if (mediaTimeSec < cue.endTimeSec)
        return 'active';
    return 'past';
}
