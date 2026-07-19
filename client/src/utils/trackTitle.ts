/**
 * Display title for a pool/tracklist entry. The raw title — including any
 * ingestion metadata prefix like `[08A - Am - 128.00]` — is shown verbatim,
 * matching the track browser. Falls back to a track-id placeholder when the
 * entry's track is missing from the hydrated set.
 */

export function displayTitle(
  track: { title: string } | null | undefined,
  trackId: number,
): string {
  return track?.title.trim() || `Track #${trackId}`
}
