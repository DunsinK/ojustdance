export const CURRENT_SELECTION_ALGORITHM = 'canonical-pose-events/4';
export const CURRENT_THUMBNAIL_ASSETS = 'source-resolution-still/2';
export const MINIMUM_TARGET_SPACING_SEC = 0.25;
export const DEFAULT_THUMBNAIL_APPEARANCE = Object.freeze({
    version: 'person-cutout/1', background: 'removed', centered: true,
});
export function matchesThumbnailAppearance(track, appearance) {
    const actual = track.appearance;
    return actual ? actual.version === appearance.version && actual.background === appearance.background && actual.centered === appearance.centered
        : appearance.background === 'original' && !appearance.centered;
}
export const THUMBNAIL_LIMITS = Object.freeze({ cues: 256, samples: 18000, sourceDurationSec: 1200, imageWidth: 576, imageHeight: 432, centeredWidth: 384, centeredHeight: 432, encodedImageChars: 256000, metadataChars: 24 * 1024 * 1024 });
export function isCurrentThumbnailTrack(track) {
    return track.algorithm === CURRENT_SELECTION_ALGORITHM && track.assetVersion === CURRENT_THUMBNAIL_ASSETS
        && track.cues.every((cue) => cue.presentation === 'pose' && cue.frameIds.length === 1);
}
export function frameId(seconds) { return `frame-${Math.round(seconds * 1000000)}`; }
