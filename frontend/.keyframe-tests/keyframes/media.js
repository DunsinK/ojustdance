export function abortError() { return new DOMException('Thumbnail preparation cancelled', 'AbortError'); }
export function checkAbort(signal) { if (signal?.aborted)
    throw abortError(); }
/** Register first, then seek/load. Every wait is cancellable and has a finite timeout. */
export function waitForMediaEvent(video, event, action, signal) {
    return new Promise((resolve, reject) => {
        checkAbort(signal);
        const complete = (error) => {
            clearTimeout(timer);
            video.removeEventListener(event, ready);
            video.removeEventListener('error', failed);
            signal?.removeEventListener('abort', cancelled);
            if (error)
                reject(error);
            else
                resolve();
        };
        const ready = () => complete();
        const failed = () => complete(new Error('Video could not be decoded. Try a supported MP4/WebM encoding.'));
        const cancelled = () => complete(abortError());
        const timer = setTimeout(() => complete(new Error(`Video ${event} timed out; check the source video and retry.`)), 15000);
        video.addEventListener(event, ready, { once: true });
        video.addEventListener('error', failed, { once: true });
        signal?.addEventListener('abort', cancelled, { once: true });
        try {
            action();
        }
        catch (error) {
            complete(error instanceof Error ? error : new Error('Media operation failed'));
        }
    });
}
export async function loadThumbnailVideo(url, signal) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    try {
        await waitForMediaEvent(video, 'loadeddata', () => { video.src = url; video.load(); }, signal);
        if (!video.videoWidth || !video.videoHeight)
            throw new Error('Video has no drawable image');
        return video;
    }
    catch (error) {
        releaseVideo(video);
        throw error;
    }
}
export async function seekVideo(video, seconds, signal) {
    checkAbort(signal);
    if (!Number.isFinite(seconds) || seconds < 0)
        throw new Error('Video seek requires nonnegative seconds');
    if (video.error)
        throw new Error('Video decoding failed for this frame');
    const target = Number.isFinite(video.duration) ? Math.min(seconds, Math.max(0, video.duration - 0.001)) : seconds;
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.0001)
        return;
    await waitForMediaEvent(video, 'seeked', () => { video.currentTime = target; }, signal);
}
export function releaseVideo(video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
}
