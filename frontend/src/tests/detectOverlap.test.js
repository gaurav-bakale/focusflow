/**
 * @file detectOverlap.test.js
 * @description Unit tests for the detectOverlap / parseLocalDateTime utilities.
 *
 * Framework: Jest 29
 *
 * Why these tests exist:
 *   The calendar BlockModal was producing FALSE POSITIVE overlap warnings because
 *   new Date("2026-04-03T00:50") (local) and new Date("2026-04-03T09:30:00Z") (UTC)
 *   are compared on different timescales. parseLocalDateTime fixes this by always
 *   interpreting the wall-clock portion as local time.
 *
 * Test IDs: OVL-01 … OVL-18
 */

import { parseLocalDateTime, detectOverlap } from '../utils/detectOverlap'

// ── parseLocalDateTime ────────────────────────────────────────────────────────

describe('parseLocalDateTime', () => {

  /**
   * OVL-01: datetime-local format (no timezone)
   * Input:  "2026-04-03T09:30"
   * Oracle: same ms as new Date(2026, 3, 3, 9, 30)
   */
  test('OVL-01: parses datetime-local string as local time', () => {
    const expected = new Date(2026, 3, 3, 9, 30).getTime()
    expect(parseLocalDateTime('2026-04-03T09:30')).toBe(expected)
  })

  /**
   * OVL-02: ISO with Z suffix — timezone IGNORED, wall-clock kept
   * Input:  "2026-04-03T09:30:00Z"
   * Oracle: same ms as new Date(2026, 3, 3, 9, 30) — Z stripped, treated as local
   */
  test('OVL-02: parses ISO-Z string, ignores Z suffix (treats as local wall-clock)', () => {
    const expected = new Date(2026, 3, 3, 9, 30).getTime()
    expect(parseLocalDateTime('2026-04-03T09:30:00Z')).toBe(expected)
  })

  /**
   * OVL-03: ISO with offset suffix — offset IGNORED, wall-clock kept
   * Input:  "2026-04-03T09:30:00+05:30"
   * Oracle: same ms as new Date(2026, 3, 3, 9, 30) — offset stripped
   */
  test('OVL-03: parses ISO+offset string, ignores offset (treats as local wall-clock)', () => {
    const expected = new Date(2026, 3, 3, 9, 30).getTime()
    expect(parseLocalDateTime('2026-04-03T09:30:00+05:30')).toBe(expected)
  })

  /**
   * OVL-04: Midnight (00:00) — common edge case
   */
  test('OVL-04: parses midnight correctly', () => {
    const expected = new Date(2026, 3, 3, 0, 0).getTime()
    expect(parseLocalDateTime('2026-04-03T00:00')).toBe(expected)
  })

  /**
   * OVL-05: Early morning (00:50) — the exact time from the bug report
   */
  test('OVL-05: parses 12:50 AM (00:50) correctly', () => {
    const expected = new Date(2026, 3, 3, 0, 50).getTime()
    expect(parseLocalDateTime('2026-04-03T00:50')).toBe(expected)
  })

  /**
   * OVL-06: Invalid / empty inputs return NaN
   */
  test('OVL-06: returns NaN for null, undefined, empty string', () => {
    expect(parseLocalDateTime(null)).toBeNaN()
    expect(parseLocalDateTime(undefined)).toBeNaN()
    expect(parseLocalDateTime('')).toBeNaN()
    expect(parseLocalDateTime(42)).toBeNaN()
  })
})

// ── detectOverlap ─────────────────────────────────────────────────────────────

// Helper to build a block object
function blk(id, start, end, title = `Block ${id}`) {
  return { id, start_time: start, end_time: end, title }
}

describe('detectOverlap', () => {

  /**
   * OVL-07: THE BUG CASE — 12:50 AM vs 9:30 AM should NOT overlap
   * Input:  new=12:50–01:15, existing=09:30–10:00 (same day)
   * Oracle: null (no overlap)
   */
  test('OVL-07: 12:50 AM–01:15 AM does NOT overlap with 09:30–10:00 AM (bug regression)', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00', 'Review Q4')]
    expect(detectOverlap('2026-04-03T00:50', '2026-04-03T01:15', blocks)).toBeNull()
  })

  /**
   * OVL-08: Same test but existing block stored with Z suffix (mixed format)
   * This is the core timezone-confusion scenario that caused the false positive.
   */
  test('OVL-08: no false positive when existing block has Z-suffix format', () => {
    const blocks = [blk('b1', '2026-04-03T09:30:00Z', '2026-04-03T10:00:00Z', 'Review Q4')]
    expect(detectOverlap('2026-04-03T00:50', '2026-04-03T01:15', blocks)).toBeNull()
  })

  /**
   * OVL-09: Exact overlap — new block perfectly coincides with existing
   * Input:  new=09:30–10:00, existing=09:30–10:00
   * Oracle: returns the conflicting block
   */
  test('OVL-09: exact same time range is an overlap', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    const result = detectOverlap('2026-04-03T09:30', '2026-04-03T10:00', blocks)
    expect(result).not.toBeNull()
    expect(result.id).toBe('b1')
  })

  /**
   * OVL-10: Partial overlap at start
   * Input:  new=09:00–09:45, existing=09:30–10:00
   * Oracle: conflict detected
   */
  test('OVL-10: partial overlap at the start of an existing block', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T09:00', '2026-04-03T09:45', blocks)).not.toBeNull()
  })

  /**
   * OVL-11: Partial overlap at end
   * Input:  new=09:45–10:30, existing=09:30–10:00
   * Oracle: conflict detected
   */
  test('OVL-11: partial overlap at the end of an existing block', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T09:45', '2026-04-03T10:30', blocks)).not.toBeNull()
  })

  /**
   * OVL-12: New block completely contains existing block
   * Input:  new=09:00–11:00, existing=09:30–10:00
   * Oracle: conflict detected
   */
  test('OVL-12: new block contains an existing block entirely', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T09:00', '2026-04-03T11:00', blocks)).not.toBeNull()
  })

  /**
   * OVL-13: Adjacent blocks (touching but NOT overlapping)
   * Input:  new=10:00–11:00, existing=09:30–10:00
   * Oracle: null (touching at boundary is NOT an overlap)
   */
  test('OVL-13: blocks that only touch at boundary are NOT overlapping', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T10:00', '2026-04-03T11:00', blocks)).toBeNull()
  })

  /**
   * OVL-14: Completely before an existing block
   * Input:  new=07:00–08:00, existing=09:30–10:00
   * Oracle: null
   */
  test('OVL-14: block before an existing block has no overlap', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T07:00', '2026-04-03T08:00', blocks)).toBeNull()
  })

  /**
   * OVL-15: Completely after an existing block
   * Input:  new=11:00–12:00, existing=09:30–10:00
   * Oracle: null
   */
  test('OVL-15: block after an existing block has no overlap', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T11:00', '2026-04-03T12:00', blocks)).toBeNull()
  })

  /**
   * OVL-16: Different day — same time of day should NOT overlap
   * Input:  new=Apr4 09:30–10:00, existing=Apr3 09:30–10:00
   * Oracle: null
   */
  test('OVL-16: same time of day on different dates does not overlap', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-04T09:30', '2026-04-04T10:00', blocks)).toBeNull()
  })

  /**
   * OVL-17: Skip self when editing (skipId matches existing block's id)
   * Input:  same time as existing block but skipId = that block's id
   * Oracle: null (editing the block itself should not self-conflict)
   */
  test('OVL-17: editing a block does not conflict with itself', () => {
    const blocks = [blk('b1', '2026-04-03T09:30', '2026-04-03T10:00')]
    expect(detectOverlap('2026-04-03T09:30', '2026-04-03T10:00', blocks, 'b1')).toBeNull()
  })

  /**
   * OVL-18: Empty or null inputs return null gracefully
   */
  test('OVL-18: null/undefined inputs return null without throwing', () => {
    expect(detectOverlap(null, null, [])).toBeNull()
    expect(detectOverlap('2026-04-03T09:30', null, [])).toBeNull()
    expect(detectOverlap('2026-04-03T09:30', '2026-04-03T10:00', null)).toBeNull()
    expect(detectOverlap('', '', [])).toBeNull()
  })

  /**
   * OVL-19: Multiple existing blocks — returns the first conflict
   * Input:  new=09:45–10:15, two blocks: 08:00–09:00 and 10:00–11:00
   * Oracle: conflict with second block (10:00–11:00)
   */
  test('OVL-19: finds the first conflicting block among multiple blocks', () => {
    const blocks = [
      blk('b1', '2026-04-03T08:00', '2026-04-03T09:00'),
      blk('b2', '2026-04-03T10:00', '2026-04-03T11:00'),
    ]
    const result = detectOverlap('2026-04-03T09:45', '2026-04-03T10:15', blocks)
    expect(result).not.toBeNull()
    expect(result.id).toBe('b2')
  })

  /**
   * OVL-20: Cross-midnight block — block that spans midnight
   * Input:  new=23:00–00:30 (next day), existing=23:30–00:00 (same night)
   * Oracle: overlap detected correctly
   */
  test('OVL-20: cross-midnight overlap is detected correctly', () => {
    const blocks = [blk('b1', '2026-04-03T23:30', '2026-04-04T00:00')]
    const result = detectOverlap('2026-04-03T23:00', '2026-04-04T00:30', blocks)
    expect(result).not.toBeNull()
    expect(result.id).toBe('b1')
  })

  /**
   * OVL-21: Cross-midnight no-overlap — late night before, early morning after
   * Input:  new=00:30–01:00 Apr4, existing=23:00–23:59 Apr3
   * Oracle: null (different day, no overlap)
   */
  test('OVL-21: late-night and early-morning on adjacent days do not overlap', () => {
    const blocks = [blk('b1', '2026-04-03T23:00', '2026-04-03T23:59')]
    expect(detectOverlap('2026-04-04T00:30', '2026-04-04T01:00', blocks)).toBeNull()
  })
})

// ── parseLocalDateTime — invalid / rollover inputs ─────────────────────────────

describe('parseLocalDateTime — invalid and rollover inputs', () => {

  /**
   * OVL-22: Invalid month (13) returns NaN — no silent rollover to next year
   * JS Date: new Date(2026, 12, 1) rolls to Jan 2027 — we must reject this.
   */
  test('OVL-22: invalid month (13) returns NaN — no silent year rollover', () => {
    expect(parseLocalDateTime('2026-13-01T09:00')).toBeNaN()
  })

  /**
   * OVL-23: Invalid day (30) for February 2026 returns NaN
   * 2026 is not a leap year; Feb 30 → March 2 in JS — we must reject this.
   */
  test('OVL-23: Feb 30 in a non-leap year returns NaN — no silent date rollover', () => {
    expect(parseLocalDateTime('2026-02-30T09:00')).toBeNaN()
  })

  /**
   * OVL-24: Block with an invalid date in start_time is skipped (treated as non-overlapping)
   * If the stored block has a corrupted date, overlap detection must not crash and
   * must NOT flag a conflict — the malformed block is silently excluded.
   */
  test('OVL-24: block with invalid start_time date is skipped — no false overlap', () => {
    // "2026-13-45" is an impossible date — the block should be ignored
    const blocks = [blk('bad', '2026-13-45T09:00', '2026-13-45T10:00')]
    const result = detectOverlap('2026-04-03T09:00', '2026-04-03T10:00', blocks)
    expect(result).toBeNull()
  })

  /**
   * OVL-25: Day 0 and month 0 (zero values) return NaN
   * Day/month are 1-based; 0 triggers JS Date to roll back a unit.
   */
  test('OVL-25: day=0 and month=0 return NaN', () => {
    expect(parseLocalDateTime('2026-00-10T09:00')).toBeNaN() // month 0 invalid
    expect(parseLocalDateTime('2026-04-00T09:00')).toBeNaN() // day 0 invalid
  })
})
