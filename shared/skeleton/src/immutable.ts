/** Copy before freezing so callers retain ownership of their input objects. */
export function createImmutableSnapshot<Value>(value: Value): Value {
  const snapshot = structuredClone(value)

  function freezeRecursively(node: unknown): void {
    if (node === null || typeof node !== 'object') {
      return
    }
    for (const child of Object.values(node)) {
      freezeRecursively(child)
    }
    Object.freeze(node)
  }

  freezeRecursively(snapshot)
  return snapshot
}
