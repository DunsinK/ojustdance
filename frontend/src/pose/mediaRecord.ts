function pickMimeType(withAudio: boolean) {
  const candidates = withAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ]
    : [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export type SessionRecorder = {
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob>;
};

export type MusicBed = {
  audio: HTMLAudioElement;
  /** Audio track(s) to mux into MediaRecorder alongside camera video. */
  stream: MediaStream;
  resumeContext: () => Promise<void>;
  dispose: () => void;
};

/**
 * Route an <audio> element to speakers + a MediaStream for recording.
 * createMediaElementSource may only be called once per element — keep this
 * for the life of the imported MP3.
 */
export function createMusicBed(audio: HTMLAudioElement): MusicBed {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaElementSource(audio);
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);
  source.connect(ctx.destination);

  return {
    audio,
    stream: dest.stream,
    async resumeContext() {
      if (ctx.state === "suspended") await ctx.resume();
    },
    dispose() {
      try {
        source.disconnect();
      } catch {
        /* already closed */
      }
      void ctx.close();
    },
  };
}

/** Merge camera video track(s) with optional music bed audio. */
export function combineAVStreams(
  videoStream: MediaStream,
  musicStream: MediaStream | null
): MediaStream {
  const tracks = [...videoStream.getVideoTracks()];
  if (musicStream) tracks.push(...musicStream.getAudioTracks());
  return new MediaStream(tracks);
}

/** Record a MediaStream with pause/resume. Call stop() to get the final Blob. */
export function startSessionRecorder(
  stream: MediaStream,
  opts?: { withAudio?: boolean }
): SessionRecorder {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  const withAudio =
    opts?.withAudio ?? stream.getAudioTracks().length > 0;
  const mimeType = pickMimeType(withAudio);
  const recorder = new MediaRecorder(
    stream,
    mimeType
      ? { mimeType, videoBitsPerSecond: 2_500_000 }
      : { videoBitsPerSecond: 2_500_000 }
  );
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(250);

  return {
    pause() {
      if (recorder.state === "recording") recorder.pause();
    },
    resume() {
      if (recorder.state === "paused") recorder.resume();
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (recorder.state === "inactive") {
          resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
          return;
        }
        recorder.onerror = () => reject(new Error("MediaRecorder failed"));
        recorder.onstop = () => {
          resolve(
            new Blob(chunks, {
              type: recorder.mimeType || mimeType || "video/webm",
            })
          );
        };
        recorder.stop();
      });
    },
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function videoExtension(blob: Blob) {
  if (blob.type.includes("mp4")) return "mp4";
  return "webm";
}
