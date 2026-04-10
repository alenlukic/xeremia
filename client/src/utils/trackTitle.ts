/**
 * Strip metadata prefixes that the ingestion pipeline may prepend to raw
 * track titles.  Handles both bracketed `[8A - Aminor - 128]` and
 * unbracketed `10A - Bm - 100.01` forms.  The unbracketed regex is
 * intentionally strict (requires ` - ` separators between all three
 * fields) so legitimate titles like "10A Remix" are preserved.
 */

const BRACKETED_PREFIX = /^\[[^\]]*\]\s*/;
const UNBRACKETED_PREFIX = /^\d{1,2}[AB]\s-\s\w+\s-\s\d+(?:\.\d+)?\s+/;

export function cleanTitle(
  track: { title: string } | null | undefined,
  trackId: number,
): string {
  if (!track) return `Track #${trackId}`;
  const stripped = track.title
    .replace(BRACKETED_PREFIX, '')
    .replace(UNBRACKETED_PREFIX, '')
    .trim();
  return stripped || `Track #${trackId}`;
}
