/** Same content fingerprint in browser and command-line replays. */
export async function implementationId(sources: Readonly<Record<string, string>>): Promise<string> {
  const source = Object.keys(sources).sort().map((path) => `${path}\n${sources[path]}`).join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return 'sha256:' + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
