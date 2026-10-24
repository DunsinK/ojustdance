function pickMimeType() {
  const candidates = [
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

/** Record a MediaStream with pause/resume. Call stop() to get the final Blob. */
export function startSessionRecorder(stream: MediaStream): SessionRecorder {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined
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
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }));
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
