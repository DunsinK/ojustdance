import { DanceSkeleton, MediaPipeStyleAdapter } from '@ojustdance/skeleton';
import { personFraming } from './personMatte.js';
import { abortError, checkAbort } from './media.js';
import { createPoseLandmarker } from '../pose/createPoseLandmarker.js';
export class PersonNotFoundError extends Error {
    constructor() { super('No reliable dancer is visible in this frame'); this.name = 'PersonNotFoundError'; }
}
/** Only selected thumbnail frames are segmented. The pose track/topology is unchanged. */
export async function createPersonSegmenter(signal) {
    checkAbort(signal);
    const creation = createPoseLandmarker('lite', { runningMode: 'IMAGE', outputSegmentationMasks: true, delegate: 'CPU' });
    let discarded = false;
    void creation.then((landmarker) => { if (discarded)
        landmarker.close(); }, () => { });
    let timer;
    let cancel = () => { };
    const interrupted = new Promise((_resolve, reject) => {
        cancel = () => reject(abortError());
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => reject(new Error('Person-mask model loading timed out. Check the network and retry.')), 45000);
        if (signal?.aborted)
            cancel();
    });
    let landmarker;
    try {
        landmarker = await Promise.race([creation, interrupted]);
    }
    catch (error) {
        discarded = true;
        throw error;
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
    const adapter = new MediaPipeStyleAdapter();
    const skeleton = new DanceSkeleton();
    return {
        segment(image) {
            checkAbort(signal);
            const result = landmarker.detect(image);
            try {
                if (!result.landmarks[0]?.length)
                    throw new PersonNotFoundError();
                const sourceMask = result.segmentationMasks?.[0];
                if (!sourceMask)
                    throw new Error('No dancer could be isolated in this reference frame');
                const mask = { width: sourceMask.width, height: sourceMask.height, values: new Float32Array(sourceMask.getAsFloat32Array()) };
                const frame = adapter.toFrame({ schemaVersion: 'mediapipe-style/1', timestampMs: 0,
                    timeline: { origin: 'video-start', id: 'thumbnail-person-mask' }, space: 'normalized-image',
                    imageSize: { width: image.width, height: image.height }, depth: 'omit', mirrored: false, landmarks: result.landmarks[0] ?? [] });
                const pose = skeleton.constructPose(frame);
                const left = pose.joints.leftHip.position, right = pose.joints.rightHip.position;
                const hips = left && right ? [left, right] : undefined;
                const torso = ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder'];
                if (!pose.joints.pelvis.position || !pose.joints.chest.position)
                    throw new PersonNotFoundError();
                const root = pose.joints.pelvis.position;
                if (root.x < 0 || root.y < 0 || root.x > image.width || root.y > image.height)
                    throw new PersonNotFoundError();
                const anchors = { hips, torso: torso.flatMap((name) => pose.joints[name].position ? [pose.joints[name].position] : []) };
                return { mask, framing: personFraming(mask, image.width, image.height, anchors) };
            }
            finally {
                result.close();
            }
        },
        close() { landmarker.close(); },
    };
}
