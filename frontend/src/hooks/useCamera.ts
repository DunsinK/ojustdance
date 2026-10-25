import { useEffect, useRef, useState } from "react";
export function useCamera() {
  const [stream, setStream] = useState<MediaStream>();
  const [status, setStatus] = useState<"off" | "requesting" | "on" | "error">(
    "off",
  );
  const [error, setError] = useState("");
  const active = useRef<MediaStream | undefined>(undefined);
  const request = useRef(0);
  const stop = () => {
    request.current++;
    active.current?.getTracks().forEach((t) => t.stop());
    active.current = undefined;
    setStream(undefined);
    setStatus("off");
    setError("");
  };
  useEffect(
    () => () => {
      request.current++;
      active.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const enable = async () => {
    const id = ++request.current;
    setStatus("requesting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera requires localhost or a secure HTTPS connection.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (id !== request.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      active.current = media;
      setStream(media);
      setStatus("on");
    } catch (err) {
      if (id !== request.current) return;
      setStatus("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was declined. Allow camera access in your browser, then retry, or continue without camera."
          : err instanceof Error
            ? err.message
            : "Camera unavailable. Connect a camera and retry, or continue without camera.",
      );
    }
  };
  return { stream, status, error, enable, stop };
}
