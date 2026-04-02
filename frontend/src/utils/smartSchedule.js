/**
 * smartSchedule.js — Intelligent time-block scheduling for tasks without a due_time.
 *
 * Problem: users create tasks with only a deadline date (no specific time).
 * This module finds the first available free slot on that date by scanning
 * in 30-minute increments and avoiding conflicts with existing blocks.
 *
 * Design decisions:
 *   – No "work hours" assumption. Users have gym, therapy, meditation, evening
 *     runs, early-morning habits, etc. We use a broad active window (6 AM–11 PM)
 *     so any lifestyle task fits naturally.
 *   – For today's date we start from *now* (rounded up to next 30 min) so we
 *     never suggest a slot that has already passed.
 *   – For future dates we start scanning from 6 AM.
 *   – Returns null when the day is fully booked; callers fall back gracefully
 *     (e.g. show the date pre-filled but leave the time for the user to pick).
 */

import { detectOverlap } from './detectOverlap'

// Broad active window — intentionally NOT "work hours" so gym / mental-health /
// personal tasks are treated the same as professional ones.
export const ACTIVE_START_HOUR = 6   // 6:00 AM
export const ACTIVE_END_HOUR   = 23  // 11:00 PM — slot must END by 23:00
export const SLOT_STEP_MINS    = 30  // search granularity

/** Build "YYYY-MM-DDTHH:MM" from components using local time. */
function toLocalStr(y, mo, d, h, mi) {
  const p = n => String(n).padStart(2, '0')
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}`
}

/**
 * Find the first free time slot on `dateStr` within the active window.
 *
 * @param {string} dateStr        "YYYY-MM-DD"
 * @param {number} durationMins   required block length in minutes
 * @param {Array}  existingBlocks array of { id, start_time, end_time }
 * @param {string} [skipId]       id of block being edited (exclude from conflict check)
 * @param {Date}   [now]          injectable clock — defaults to new Date(), used in tests
 * @returns {{ start_time: string, end_time: string } | null}
 */
export function findFreeSlot(dateStr, durationMins, existingBlocks = [], skipId = null, now = new Date()) {
  if (!dateStr || !isFinite(durationMins) || durationMins <= 0) return null
  const [y, mo, d] = dateStr.split('-').map(Number)
  if (!y || !mo || !d) return null
  // Reject dates that JS would silently roll over (e.g. "2026-02-30" → March 2)
  const testDate = new Date(y, mo - 1, d)
  if (testDate.getFullYear() !== y || testDate.getMonth() !== mo - 1 || testDate.getDate() !== d) return null

  const activeStart = new Date(y, mo - 1, d, ACTIVE_START_HOUR, 0).getTime()
  const activeEnd   = new Date(y, mo - 1, d, ACTIVE_END_HOUR,   0).getTime()
  const durationMs  = durationMins * 60000

  // A slot that needs `durationMins` can never fit if the whole window is smaller
  if (durationMs > activeEnd - activeStart) return null

  // If deadline is today and we're already past active start, begin from now
  const nowDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const slotDate  = new Date(y, mo - 1, d).getTime()
  const isToday   = nowDate === slotDate

  let searchFromMs
  if (isToday && now.getTime() > activeStart) {
    // Round up to next SLOT_STEP so we never suggest a past time
    searchFromMs = Math.ceil(now.getTime() / (SLOT_STEP_MINS * 60000)) * (SLOT_STEP_MINS * 60000)
  } else {
    searchFromMs = activeStart
  }

  // No room left today after rounding up
  if (searchFromMs + durationMs > activeEnd) return null

  let candidateMs = searchFromMs
  while (candidateMs + durationMs <= activeEnd) {
    const s = new Date(candidateMs)
    const e = new Date(candidateMs + durationMs)

    const startStr = toLocalStr(s.getFullYear(), s.getMonth()+1, s.getDate(), s.getHours(), s.getMinutes())
    const endStr   = toLocalStr(e.getFullYear(), e.getMonth()+1, e.getDate(), e.getHours(), e.getMinutes())

    if (!detectOverlap(startStr, endStr, existingBlocks, skipId)) {
      return { start_time: startStr, end_time: endStr }
    }

    candidateMs += SLOT_STEP_MINS * 60000
  }

  return null // every slot on this day is blocked
}

// ── Recurrence window sizes (days ahead to pre-generate blocks) ───────────────
// Chosen to be meaningful without flooding the calendar:
//   DAILY    →  14 days  (2 weeks — dense, so keep the window short)
//   WEEKDAYS →  14 days  (~10 weekday blocks)
//   WEEKLY   →  56 days  (8 weeks)
//   MONTHLY  →  90 days  (3 months)
const RECURRENCE_WINDOW = { DAILY: 14, WEEKDAYS: 14, WEEKLY: 56, MONTHLY: 90 }

/** Format a Date as "YYYY-MM-DD". */
function fmtDate(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Return the next weekday (Mon–Fri) strictly after `date`. */
function nextWeekday(date) {
  const d = new Date(date)
  do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6)
  return d
}

/**
 * Generate all occurrence dates for a recurring task within a rolling window.
 *
 * Only dates from today onwards are included so we never create blocks in the
 * past.  The window is measured from today, not from startDateStr, so even an
 * old task still gets a meaningful set of future blocks.
 *
 * @param {string} startDateStr  "YYYY-MM-DD" — first/anchor occurrence date
 * @param {string} recurrence    "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY"
 * @param {Date}   [now]         injectable clock for deterministic tests
 * @returns {string[]}           array of "YYYY-MM-DD" strings (≥ today, ≤ window end)
 */
export function generateRecurringDates(startDateStr, recurrence, now = new Date()) {
  if (!startDateStr || !recurrence || recurrence === 'NONE') {
    return startDateStr ? [startDateStr] : []
  }

  const [y, mo, d] = startDateStr.split('-').map(Number)
  if (!y || !mo || !d) return []

  const windowDays = RECURRENCE_WINDOW[recurrence] ?? 14
  const today      = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const windowEnd  = new Date(today); windowEnd.setDate(today.getDate() + windowDays)

  let cursor = new Date(y, mo - 1, d)
  const dates = []

  // Advance past dates before today (task created in the past)
  while (cursor < today) {
    switch (recurrence) {
      case 'DAILY':    cursor.setDate(cursor.getDate() + 1); break
      case 'WEEKDAYS': cursor = nextWeekday(cursor); break
      case 'WEEKLY':   cursor.setDate(cursor.getDate() + 7); break
      case 'MONTHLY':  cursor.setMonth(cursor.getMonth() + 1); break
      default:         cursor = new Date(today.getTime() + 1) // exit
    }
  }

  // Collect all dates within the window
  while (cursor <= windowEnd) {
    // For WEEKDAYS, skip Saturday (6) and Sunday (0) — the start date or any
    // advanced date might land on a weekend (e.g. task deadline on Saturday).
    if (recurrence === 'WEEKDAYS' && (cursor.getDay() === 0 || cursor.getDay() === 6)) {
      cursor = nextWeekday(cursor)
      continue // re-evaluate the bounds check
    }

    dates.push(fmtDate(cursor))
    const prev = new Date(cursor)
    switch (recurrence) {
      case 'DAILY':    cursor.setDate(cursor.getDate() + 1); break
      case 'WEEKDAYS': cursor = nextWeekday(prev); break
      case 'WEEKLY':   cursor.setDate(cursor.getDate() + 7); break
      case 'MONTHLY':  cursor.setMonth(cursor.getMonth() + 1); break
      default:         cursor = new Date(windowEnd.getTime() + 1) // exit
    }
  }

  return dates
}

/**
 * Generate all calendar block payloads for a task (one-off or recurring).
 *
 * One-off tasks  → one block (existing smartScheduleTask behaviour).
 * Recurring tasks → one block per occurrence within the rolling window.
 *   Each day's block avoids ALL existing blocks AND the blocks already
 *   generated for earlier occurrences (collision-free scheduling).
 *   If a particular day is fully packed, that occurrence is skipped
 *   rather than aborting the whole series.
 *
 * @param {object}  task            { id, title, deadline, due_time, recurrence }
 * @param {number}  focusMins       from TimerContext (default 25)
 * @param {Array}   existingBlocks  current calendar blocks (fetched before calling)
 * @param {string}  [groupId]       shared recurrence_group_id for the series (UUID)
 * @param {Date}    [now]           injectable clock
 * @returns {Array} array of block-create payloads ready for createBlock / createBlocksBulk
 */
export function generateRecurringSlots(task, focusMins, existingBlocks = [], groupId = null, now = new Date()) {
  if (!task?.deadline) return []
  if (!isFinite(focusMins) || focusMins <= 0) return []

  const recurrence = task.recurrence || 'NONE'

  if (recurrence === 'NONE') {
    // One-off task — single block, existing behaviour
    const slot = smartScheduleTask(task, focusMins, existingBlocks, null, now)
    if (!slot) return []
    return [{
      ...slot,
      title:               task.title,
      task_id:             task.id,
      color:               '#6366f1',
      recurrence:          'NONE',
      recurrence_group_id: null,
    }]
  }

  const dates        = generateRecurringDates(task.deadline, recurrence, now)
  const slots        = []
  let workingBlocks  = [...existingBlocks]  // grows as we schedule each occurrence

  for (const date of dates) {
    const taskForDate = { ...task, deadline: date }
    const slot = smartScheduleTask(taskForDate, focusMins, workingBlocks, null, now)
    if (!slot) continue  // day fully booked — skip, don't abort the series

    const block = {
      ...slot,
      title:               task.title,
      task_id:             task.id,
      color:               '#6366f1',
      recurrence,
      recurrence_group_id: groupId,
    }
    slots.push(block)

    // Make this slot visible to the scheduler when it plans the next occurrence
    workingBlocks = [...workingBlocks, {
      id: `_sched_${slots.length}`,
      start_time: slot.start_time,
      end_time:   slot.end_time,
    }]
  }

  return slots
}

/**
 * Smart-schedule a task: derive start_time + end_time from its deadline.
 *
 *  – If task has due_time: pin the block there (start = deadline + due_time, end = + 4×focusMins).
 *  – If task has deadline only: call findFreeSlot to pick the first free window.
 *  – If task has no deadline: return null.
 *
 * @param {object} task           { deadline?, due_time?, title? }
 * @param {number} focusMins      from TimerContext (default 25)
 * @param {Array}  existingBlocks current time blocks
 * @param {string} [skipId]       block being edited
 * @param {Date}   [now]          injectable clock for tests
 * @returns {{ start_time: string, end_time: string } | null}
 */
export function smartScheduleTask(task, focusMins, existingBlocks = [], skipId = null, now = new Date()) {
  if (!task?.deadline) return null
  if (!isFinite(focusMins) || focusMins <= 0) return null

  const durationMins = focusMins * 4 // 4 Pomodoros, no breaks counted

  if (task.due_time) {
    // User already specified a time — respect it, just compute the end.
    // Validate due_time: must be "HH:MM" with H in 0–23 and M in 0–59.
    const timeParts = String(task.due_time).split(':').map(Number)
    const [h = NaN, mi = NaN] = timeParts
    if (!isFinite(h) || !isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null

    const [y, mo, d] = task.deadline.split('-').map(Number)
    if (!y || !mo || !d) return null
    // Reject rolled-over deadline dates
    const baseDate = new Date(y, mo - 1, d, h, mi)
    if (baseDate.getFullYear() !== y || baseDate.getMonth() !== mo - 1 ||
        baseDate.getDate() !== d || baseDate.getHours() !== h || baseDate.getMinutes() !== mi) return null

    const start = `${task.deadline}T${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`
    const end = new Date(baseDate.getTime() + durationMins * 60000)
    return {
      start_time: start,
      end_time:   toLocalStr(end.getFullYear(), end.getMonth()+1, end.getDate(), end.getHours(), end.getMinutes()),
    }
  }

  // No due_time — find the first conflict-free slot on the deadline date
  return findFreeSlot(task.deadline, durationMins, existingBlocks, skipId, now)
}
