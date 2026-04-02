/**
 * @file smartSchedule.test.js
 * @description Unit tests for findFreeSlot and smartScheduleTask.
 *
 * Framework: Jest 29
 *
 * Why these tests exist:
 *   Users create tasks with only a deadline date — no specific time. The scheduler
 *   must find a conflict-free slot across a broad active window (6 AM–11 PM) that
 *   covers gym, work, therapy, evening runs, meditation, etc. — not just "work hours".
 *
 * Helpers:
 *   blk(id, start, end)  — build a minimal block object
 *   at(date, HH, MM)     — build a "YYYY-MM-DDTHH:MM" string on a given date
 *   nowAt(date, HH, MM)  — build a Date object for the injectable `now` param
 */

import { findFreeSlot, smartScheduleTask, ACTIVE_START_HOUR, ACTIVE_END_HOUR, SLOT_STEP_MINS } from '../utils/smartSchedule'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE = '2026-05-10' // Sunday — a fixed future date for deterministic tests
const TODAY_DATE = new Date(2026, 4, 10) // May 10 2026 — matches DATE

function blk(id, start, end) {
  return { id, start_time: start, end_time: end, title: `Block ${id}` }
}

function at(HH, MM = '00') {
  return `${DATE}T${String(HH).padStart(2,'0')}:${String(MM).padStart(2,'0')}`
}

/** Injectable `now` — sets current time to HH:MM on DATE (same day as target) */
function nowAt(HH, MM = 0) {
  return new Date(2026, 4, 10, HH, MM, 0)
}

/** Injectable `now` — sets current time to HH:MM on a DIFFERENT day than DATE */
function nowOnDifferentDay(HH = 9, MM = 0) {
  return new Date(2026, 4, 9, HH, MM, 0) // May 9 — day before DATE
}

const FOCUS = 25 // TimerContext default

// ─────────────────────────────────────────────────────────────────────────────
// findFreeSlot
// ─────────────────────────────────────────────────────────────────────────────

describe('findFreeSlot', () => {

  /**
   * SS-01: No existing blocks → slot starts at ACTIVE_START (6 AM) for a future date
   */
  test('SS-01: future date with no blocks → first slot at 6:00 AM', () => {
    const result = findFreeSlot(DATE, 100, [], null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(6, 0))
    expect(result.end_time).toBe(at(7, 40)) // 6:00 + 100 min
  })

  /**
   * SS-02: Today with current time at 14:00 → first slot at 14:00 (not 6 AM)
   * Real scenario: user creates a task midday — slot must not be in the past.
   */
  test('SS-02: today at 14:00 with no blocks → slot starts at 14:00', () => {
    const result = findFreeSlot(DATE, 100, [], null, nowAt(14, 0))
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(14, 0))
  })

  /**
   * SS-03: Today at 14:15 → rounds up to 14:30 (next 30-min boundary)
   */
  test('SS-03: today at 14:15 → slot rounds up to 14:30', () => {
    const result = findFreeSlot(DATE, 100, [], null, nowAt(14, 15))
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(14, 30))
  })

  /**
   * SS-04: Early gym block at 6:00–7:40 → next slot at 8:00
   * Real scenario: user already has a morning workout scheduled.
   */
  test('SS-04: gym block at 6:00–7:40 → next slot at 8:00', () => {
    const blocks = [blk('gym', at(6, 0), at(7, 40))]
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(8, 0)) // 7:40 is between 7:30 and 8:00 → next step 8:00
  })

  /**
   * SS-05: Gym 6:00–7:40, work 10:00–12:00 → 140-min gap 7:40–10:00 → first slot at 8:00
   * (gap from 7:30 step is 8:00 since [8:00,9:40] doesn't touch work block at 10:00)
   * Real scenario: gym in morning, work later — find the gap between them.
   */
  test('SS-05: gym 6:00–7:40 + work 10:00–12:00 → free gap at 8:00', () => {
    const blocks = [
      blk('gym',  at(6, 0),  at(7, 40)),
      blk('work', at(10, 0), at(12, 0)),
    ]
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(8, 0))
    expect(result.end_time).toBe(at(9, 40))
  })

  /**
   * SS-06: Morning fully packed 6:00–13:00 → first slot at 13:00
   * Real scenario: packed morning, afternoon is free.
   */
  test('SS-06: morning packed 6:00–13:00 → slot at 13:00', () => {
    const blocks = [blk('morning', at(6, 0), at(13, 0))]
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(13, 0))
  })

  /**
   * SS-07: Day packed from 6 AM to 6 PM, evening free → first slot at 18:00
   * Real scenario: user has a packed day from early morning; evening walk is free.
   */
  test('SS-07: full day 6:00–18:00, evening free → slot at 18:00', () => {
    const blocks = [blk('packed', at(6, 0), at(18, 0))]
    const result = findFreeSlot(DATE, 60, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(18, 0))
  })

  /**
   * SS-08: Adjacent blocks with exact fit — slot between two blocks
   * Gap: 12:00–14:00 (120 min). Need 100 min → fits.
   */
  test('SS-08: 100-min gap between two blocks is used', () => {
    const blocks = [
      blk('morning',   at(6,  0), at(12, 0)),
      blk('afternoon', at(14, 0), at(16, 0)),
    ]
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(12, 0))
    expect(result.end_time).toBe(at(13, 40))
  })

  /**
   * SS-09: Gap too small — 30-min gap, need 100 min → must skip to after afternoon block
   */
  test('SS-09: 30-min gap (too small for 100 min) is skipped; schedules after the gap', () => {
    const blocks = [
      blk('a', at(6,  0), at(12,  0)),
      blk('b', at(12, 30), at(18, 0)),
    ]
    // Gap between 12:00–12:30 = only 30 min, not enough for 100 min
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(18, 0)) // after block b
  })

  /**
   * SS-10: Entire active day is booked → returns null
   * Real scenario: fully packed day — no auto-schedule possible.
   */
  test('SS-10: fully booked day → returns null', () => {
    const blocks = [blk('all-day', at(ACTIVE_START_HOUR, 0), at(ACTIVE_END_HOUR, 0))]
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).toBeNull()
  })

  /**
   * SS-11: skipId excludes the block being edited — no self-conflict
   * Real scenario: editing an existing block's time — the block itself shouldn't block us.
   */
  test('SS-11: editing a block (skipId) does not conflict with itself', () => {
    const blocks = [blk('editable', at(6, 0), at(7, 40))]
    const result = findFreeSlot(DATE, 100, blocks, 'editable', nowOnDifferentDay())
    // Without skip, 6:00 would conflict. With skip, it should return 6:00.
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(6, 0))
  })

  /**
   * SS-12: Today at 22:30 — only 30 min left before ACTIVE_END (23:00) → null
   * A 100-min block cannot fit in 30 min.
   */
  test('SS-12: late at night with less than durationMins remaining → null', () => {
    const result = findFreeSlot(DATE, 100, [], null, nowAt(22, 30))
    expect(result).toBeNull()
  })

  /**
   * SS-13: Short task (30 min) — last possible slot near end of day
   */
  test('SS-13: 30-min task fits in the last slot before ACTIVE_END', () => {
    // Block everything except 22:30–23:00
    const blocks = [blk('long', at(6, 0), at(22, 30))]
    const result = findFreeSlot(DATE, 30, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(22, 30))
    expect(result.end_time).toBe(at(23, 0))
  })

  /**
   * SS-14: Multiple blocks — finds exact first free gap
   * Blocks: 6:00–8:00, 9:00–11:00, 13:00–15:00
   * Free gaps: 8:00–9:00 (60 min), 11:00–13:00 (120 min)
   * Need 100 min → 8:00–9:00 is too small (60 min) → first fit is 11:00
   */
  test('SS-14: multiple blocks, picks first gap large enough for the duration', () => {
    const blocks = [
      blk('a', at(6,  0), at(8,  0)), // 6–8
      blk('b', at(9,  0), at(11, 0)), // 9–11
      blk('c', at(13, 0), at(15, 0)), // 13–15
    ]
    const result = findFreeSlot(DATE, 100, blocks, null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    // Gap 8:00–9:00 = 60 min (too small); next gap 11:00–13:00 = 120 min → fits
    expect(result.start_time).toBe(at(11, 0))
  })

  /**
   * SS-15: Invalid inputs return null gracefully
   */
  test('SS-15: invalid dateStr or zero duration returns null', () => {
    expect(findFreeSlot(null, 100, [])).toBeNull()
    expect(findFreeSlot('', 100, [])).toBeNull()
    expect(findFreeSlot(DATE, 0, [])).toBeNull()
    expect(findFreeSlot(DATE, -10, [])).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// smartScheduleTask
// ─────────────────────────────────────────────────────────────────────────────

describe('smartScheduleTask', () => {

  /**
   * SS-16: Task with deadline + due_time → pinned start, end = +100 min
   * Real scenario: user set a 9:00 AM standup — respect that exactly.
   */
  test('SS-16: task with due_time uses it as start, end = start + 4×focusMins', () => {
    const task = { deadline: DATE, due_time: '09:30' }
    const result = smartScheduleTask(task, FOCUS, [])
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(`${DATE}T09:30`)
    expect(result.end_time).toBe(`${DATE}T11:10`) // +100 min
  })

  /**
   * SS-17: Task with deadline only, no blocks → smart-scheduled at 6:00 AM
   * Real scenario: gym task with no time specified.
   */
  test('SS-17: task with deadline only, no blocks → scheduled at 6:00 AM (future date)', () => {
    const task = { deadline: DATE, due_time: null }
    const result = smartScheduleTask(task, FOCUS, [], null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(6, 0))
    expect(result.end_time).toBe(at(7, 40))
  })

  /**
   * SS-18: Task with deadline only, today at 14:00 → scheduled at current time
   * Real scenario: user adds a "take a walk" task at 2 PM.
   */
  test('SS-18: task with deadline=today, no blocks, now=14:00 → scheduled at 14:00', () => {
    const task = { deadline: DATE, due_time: null }
    const result = smartScheduleTask(task, FOCUS, [], null, nowAt(14, 0))
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(14, 0))
  })

  /**
   * SS-19: Task with no deadline → null
   */
  test('SS-19: task without deadline returns null', () => {
    expect(smartScheduleTask({ title: 'Buy groceries' }, FOCUS, [])).toBeNull()
    expect(smartScheduleTask(null, FOCUS, [])).toBeNull()
    expect(smartScheduleTask({}, FOCUS, [])).toBeNull()
  })

  /**
   * SS-20: Fully booked day → null (caller must handle gracefully)
   */
  test('SS-20: fully booked deadline date → returns null', () => {
    const task = { deadline: DATE, due_time: null }
    const blocks = [blk('all', at(ACTIVE_START_HOUR, 0), at(ACTIVE_END_HOUR, 0))]
    const result = smartScheduleTask(task, FOCUS, blocks, null, nowOnDifferentDay())
    expect(result).toBeNull()
  })

  /**
   * SS-21: Evening task — therapy at 7 PM (with due_time) → pinned and not blocked by 9-6 gate
   * This test specifically validates there is NO work-hours constraint.
   */
  test('SS-21: evening therapy task with due_time=19:00 is scheduled correctly (no work-hours gate)', () => {
    const task = { deadline: DATE, due_time: '19:00' }
    const result = smartScheduleTask(task, FOCUS, [])
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(`${DATE}T19:00`)
    expect(result.end_time).toBe(`${DATE}T20:40`)
  })

  /**
   * SS-22: Early gym task — no due_time, first slot is 6 AM → scheduled pre-work
   */
  test('SS-22: early gym (no due_time) auto-scheduled at 6:00 AM, before normal work hours', () => {
    const task = { deadline: DATE, due_time: null }
    const result = smartScheduleTask(task, FOCUS, [], null, nowOnDifferentDay())
    expect(result).not.toBeNull()
    // Must be scheduled before 9 AM (no work-hours restriction)
    const [, tp] = result.start_time.split('T')
    const hour = parseInt(tp.split(':')[0], 10)
    expect(hour).toBeLessThan(9)
  })

  /**
   * SS-23: focusMins respects user's custom Pomodoro setting
   * User has 30-min Pomodoros → block = 120 min.
   */
  test('SS-23: respects custom focusMins (30 min) → block duration = 4×30 = 120 min', () => {
    const task = { deadline: DATE, due_time: '10:00' }
    const result = smartScheduleTask(task, 30, []) // 30-min Pomodoros
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(`${DATE}T10:00`)
    expect(result.end_time).toBe(`${DATE}T12:00`) // 10:00 + 120 min
  })

  /**
   * SS-24: Skip self when re-scheduling an existing block
   */
  test('SS-24: skipId prevents block from conflicting with itself during edit', () => {
    const task = { deadline: DATE, due_time: null }
    const blocks = [blk('self', at(6, 0), at(7, 40))]
    // Without skip → would skip 6:00 slot. With skip → 6:00 is free.
    const result = smartScheduleTask(task, FOCUS, blocks, 'self', nowOnDifferentDay())
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(6, 0))
  })

  /**
   * SS-25: Today's task created mid-day — rounds up to next 30-min boundary
   * now = 14:10 → rounded to 14:30
   */
  test('SS-25: today task created at 14:10 → auto-scheduled at 14:30 (rounded)', () => {
    const task = { deadline: DATE, due_time: null }
    const result = smartScheduleTask(task, FOCUS, [], null, nowAt(14, 10))
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(at(14, 30))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases & invalid inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases — invalid inputs and boundary conditions', () => {

  /**
   * SS-26: findFreeSlot with NaN duration returns null (no crash)
   * Scenario: developer bug passes NaN as durationMins.
   */
  test('SS-26: findFreeSlot with NaN duration returns null', () => {
    expect(findFreeSlot(DATE, NaN, [])).toBeNull()
  })

  /**
   * SS-27: findFreeSlot with invalid (rolled-over) dateStr returns null
   * "2026-02-30" would silently become March 2 without validation.
   */
  test('SS-27: findFreeSlot with dateStr "2026-02-30" (Feb rollover) returns null', () => {
    expect(findFreeSlot('2026-02-30', 100, [])).toBeNull()
  })

  /**
   * SS-28: smartScheduleTask with NaN focusMins returns null
   * Scenario: TimerContext provides NaN (corrupt state).
   */
  test('SS-28: smartScheduleTask with focusMins=NaN returns null', () => {
    const task = { deadline: DATE, due_time: null }
    expect(smartScheduleTask(task, NaN, [])).toBeNull()
  })

  /**
   * SS-29: smartScheduleTask with focusMins=0 returns null
   */
  test('SS-29: smartScheduleTask with focusMins=0 returns null', () => {
    const task = { deadline: DATE, due_time: null }
    expect(smartScheduleTask(task, 0, [])).toBeNull()
  })

  /**
   * SS-30: smartScheduleTask with due_time="25:00" (hour out of range) returns null
   * Scenario: user or API sends a malformed time string that looks numeric but is invalid.
   */
  test('SS-30: due_time with hour=25 (out of range) returns null', () => {
    const task = { deadline: DATE, due_time: '25:00' }
    expect(smartScheduleTask(task, FOCUS, [])).toBeNull()
  })

  /**
   * SS-31: smartScheduleTask with due_time="09:60" (minute out of range) returns null
   */
  test('SS-31: due_time with minute=60 (out of range) returns null', () => {
    const task = { deadline: DATE, due_time: '09:60' }
    expect(smartScheduleTask(task, FOCUS, [])).toBeNull()
  })

  /**
   * SS-32: smartScheduleTask with due_time="abc" (non-numeric) returns null
   */
  test('SS-32: due_time="abc" (non-numeric) returns null', () => {
    const task = { deadline: DATE, due_time: 'abc' }
    expect(smartScheduleTask(task, FOCUS, [])).toBeNull()
  })

  /**
   * SS-33: smartScheduleTask with invalid deadline "2026-02-30" returns null
   * Scenario: date validation catches Feb 30 before JS silently rolls to March 2.
   */
  test('SS-33: invalid deadline "2026-02-30" (Feb rollover) returns null', () => {
    const task = { deadline: '2026-02-30', due_time: null }
    expect(smartScheduleTask(task, FOCUS, [], null, nowOnDifferentDay())).toBeNull()
  })

  /**
   * SS-34: due_time "00:00" (midnight) is a valid edge case — produces a block
   * Midnight is a legitimate time (hour=0, minute=0), not invalid.
   */
  test('SS-34: due_time="00:00" (midnight) is valid and produces a block', () => {
    const task = { deadline: DATE, due_time: '00:00' }
    const result = smartScheduleTask(task, FOCUS, [])
    expect(result).not.toBeNull()
    expect(result.start_time).toBe(`${DATE}T00:00`)
  })

  /**
   * SS-35: smartScheduleTask with negative focusMins returns null
   */
  test('SS-35: smartScheduleTask with focusMins=-5 returns null', () => {
    const task = { deadline: DATE, due_time: null }
    expect(smartScheduleTask(task, -5, [])).toBeNull()
  })
})
