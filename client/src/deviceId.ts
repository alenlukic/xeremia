/**
 * Stable, per-device identifier used to scope table/column preferences to the
 * browser they were configured on. The raw device id is a random value kept in
 * localStorage; the value sent to the server is a hash of it, so the persisted
 * key is opaque rather than the raw identifier.
 */

const DEVICE_ID_KEY = 'xeremia-device-id'

function readOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) {
      return existing
    }
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch {
    // localStorage is unavailable (e.g. private-mode restrictions). Fall back
    // to a fixed token so preferences still round-trip within the session.
    return 'ephemeral'
  }
}

/**
 * cyrb53: a fast, well-distributed non-cryptographic string hash. A stable
 * opaque device key is all that is needed here, so this avoids the async Web
 * Crypto API and its secure-context requirement.
 */
function cyrb53(input: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hashed = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return hashed.toString(16)
}

let cachedHash: string | null = null

/** Hashed device id sent as the `X-Device-Id` header for preference requests. */
export function getDeviceHash(): string {
  if (cachedHash === null) {
    cachedHash = cyrb53(readOrCreateDeviceId())
  }
  return cachedHash
}
