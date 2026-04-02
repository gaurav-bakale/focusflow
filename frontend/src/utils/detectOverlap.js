/**
 * detectOverlap.js — Timezone-safe overlap detection for time blocks.
 *
 * Problem: new Date("2026-04-03T00:50") is LOCAL time, but
 * new Date("2026-04-03T09:30:00Z") is UTC. Mixing these causes
 * false positives / false negatives when the user is not in UTC.
 *
 * Fix: always parse datetime strings via the multi-argument Date constructor
 * (new Date(y, m, d, h, min)) which is always LOCAL time, regardless of
 * how the original string was formatted.
 */

/**
 * Parse any ISO-like datetime string as LOCAL time.
 * Accepts: "YYYY-MM-DD", "YYYY-MM-DDTHH:MM", "YYYY-MM-DDTHH:MM:SS",
 *          "YYYY-MM-DDTHH:MM:SSZ", "YYYY-MM-DDTHH:MM:SS+HH:MM", etc.
 * The timezone suffix is intentionally IGNORED — we always treat the
 * wall-clock portion as local time, because datetime-local inputs are
 * local and the app stores/displays times in the user's timezone.
 *
 * @param {string} str  datetime string
 * @returns {number}    ms since epoch (local interpretation), or NaN if invalid
 */
export function parseLocalDateTime(str) {
  if (!str || typeof str !== 'string') return NaN
  // Strip timezone suffix (Z or ±HH:MM or ±HHMM) — take first 19 chars max
  const bare = str.slice(0, 19).replace('Z', '')
  const [datePart, timePart = '00:00'] = bare.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h = 0, mi = 0, sec = 0] = timePart.split(':').map(Number)
  if (!y || !mo || !d) return NaN
  return new Date(y, mo - 1, d, h, mi, sec).getTime()
}

/**
 * Find the first block in existingBlocks that overlaps [newStart, newEnd).
 * Uses parseLocalDateTime so both the form input and stored blocks are
 * compared on the same local-time scale.
 *
 * @param {string}   newStart       datetime-local or ISO string for new block start
 * @param {string}   newEnd         datetime-local or ISO string for new block end
 * @param {Array}    existingBlocks array of block objects with start_time / end_time
 * @param {string}   [skipId]       id of the block being edited (skip self-overlap)
 * @returns {object|null}           the conflicting block, or null if no overlap
 */
export function detectOverlap(newStart, newEnd, existingBlocks, skipId) {
  if (!newStart || !newEnd || !Array.isArray(existingBlocks)) return null
  const s = parseLocalDateTime(newStart)
  const e = parseLocalDateTime(newEnd)
  if (isNaN(s) || isNaN(e) || e <= s) return null

  return existingBlocks.find(b => {
    if (skipId && b.id === skipId) return false
    const bs = parseLocalDateTime(b.start_time)
    const be = parseLocalDateTime(b.end_time)
    if (isNaN(bs) || isNaN(be)) return false
    // Standard interval overlap: s < be AND e > bs
    return s < be && e > bs
  }) ?? null
}
