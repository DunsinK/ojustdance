const KEY = "ojustdance.cameraCheck";

export function markCameraCheckPassed() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

export function hasCameraCheckPassed() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearCameraCheck() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
