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
  if (!dateStr || durationMins <= 0) return null
  const [y, mo, d] = dateStr.split('-').map(Number)
  if (!y || !mo || !d) return null

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

  const durationMins = focusMins * 4 // 4 Pomodoros, no breaks counted

  if (task.due_time) {
    // User already specified a time — respect it, just compute the end
    const start = `${task.deadline}T${task.due_time}`
    const [dp, tp] = start.split('T')
    const [y, mo, d] = dp.split('-').map(Number)
    const [h, mi]    = tp.split(':').map(Number)
    const end = new Date(new Date(y, mo-1, d, h, mi).getTime() + durationMins * 60000)
    return {
      start_time: start,
      end_time:   toLocalStr(end.getFullYear(), end.getMonth()+1, end.getDate(), end.getHours(), end.getMinutes()),
    }
  }

  // No due_time — find the first conflict-free slot on the deadline date
  return findFreeSlot(task.deadline, durationMins, existingBlocks, skipId, now)
}
