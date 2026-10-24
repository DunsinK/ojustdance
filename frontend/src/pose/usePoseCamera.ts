/** @deprecated Prefer usePoseSource — kept as a thin camera wrapper. */
import { usePoseSource } from "./usePoseSource";
import type { ModelKey, PoseFrame } from "./types";

type Options = {
  enabled: boolean;
  model?: ModelKey;
  mirror?: boolean;
  onFrame?: (frame: PoseFrame) => void;
};

export function usePoseCamera(options: Options) {
  return usePoseSource({
    mode: "camera",
    enabled: options.enabled,
    model: options.model,
    mirror: options.mirror,
    onFrame: options.onFrame,
  });
}
