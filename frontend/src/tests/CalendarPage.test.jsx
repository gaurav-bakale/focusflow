/**
 * @file CalendarPage.test.jsx
 * @description Comprehensive tests for the CalendarPage component.
 * Tests: Strategy pattern (recurrence expansion) + Observer pattern (filter state)
 *
 * Framework: Jest 29 + React Testing Library 16
 * Strategy:
 *   - FullCalendar mocked (JSDOM-incompatible) — renders events as divs.
 *   - taskService and otherServices fully mocked — no real HTTP calls.
 *   - Recurrence expansion logic exercised via rendered calendar events.
 *
 * Test oracle convention:
 *   Each test has: // Input: ... | Oracle: ... | Pass: ...
 */

import React from 'react'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CalendarPage from '../pages/CalendarPage'
import { AuthProvider } from '../context/AuthContext'
import { TimerProvider } from '../context/TimerContext'

// ── FullCalendar mock (not JSDOM-compatible) ──────────────────────────────────
jest.mock('@fullcalendar/react', () => ({
  __esModule: true,
  default: ({ events }) => (
    <div data-testid="fullcalendar">
      {events?.map(e => (
        <div key={e.id} data-testid="cal-event" data-event-id={e.id}>
          {e.title}
        </div>
      ))}
    </div>
  ),
}))
jest.mock('@fullcalendar/timegrid',    () => ({ __esModule: true, default: {} }))
jest.mock('@fullcalendar/daygrid',     () => ({ __esModule: true, default: {} }))
jest.mock('@fullcalendar/interaction', () => ({ __esModule: true, default: {} }))

// ── Service mocks ─────────────────────────────────────────────────────────────
const mockFetchTasks  = jest.fn()
const mockFetchBlocks = jest.fn()

jest.mock('../services/taskService', () => ({
  fetchTasks:       (...a) => mockFetchTasks(...a),
  markTaskComplete: jest.fn().mockResolvedValue({}),
}))

jest.mock('../services/otherServices', () => ({
  fetchBlocks:   (...a) => mockFetchBlocks(...a),
  createBlock:   jest.fn().mockResolvedValue({}),
  updateBlock:   jest.fn().mockResolvedValue({}),
  deleteBlock:   jest.fn().mockResolvedValue({}),
  logSession:    jest.fn().mockResolvedValue({}),
  fetchSessions: jest.fn().mockResolvedValue([]),
  fetchStats:    jest.fn().mockResolvedValue({ tasks_done: 0, deep_work_hours: 0 }),
}))

// ── Date helpers ──────────────────────────────────────────────────────────────
const fmt = (d) => d.toISOString().split('T')[0]
const NOW   = new Date()
const TODAY = fmt(NOW)

// ── Sample data ───────────────────────────────────────────────────────────────
const SAMPLE_BLOCKS = []

const SAMPLE_TASKS = [
  {
    id: 'task-none',
    title: 'One-time task',
    priority: 'HIGH',
    status: 'TODO',
    deadline: TODAY,
    recurrence: 'NONE',
    is_complete: false,
  },
  {
    id: 'task-daily',
    title: 'Daily standup',
    priority: 'MEDIUM',
    status: 'TODO',
    deadline: TODAY,
    recurrence: 'DAILY',
    is_complete: false,
  },
  {
    id: 'task-weekly',
    title: 'Weekly review',
    priority: 'LOW',
    status: 'TODO',
    deadline: TODAY,
    recurrence: 'WEEKLY',
    is_complete: false,
  },
  {
    id: 'task-done',
    title: 'Completed task',
    priority: 'MEDIUM',
    status: 'DONE',
    deadline: TODAY,
    recurrence: 'NONE',
    is_complete: true,
  },
]

// ── Wrapper ───────────────────────────────────────────────────────────────────
function Wrapper({ children }) {
  return (
    <MemoryRouter>
      <AuthProvider>
        <TimerProvider>{children}</TimerProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

async function renderCalendar(tasks = SAMPLE_TASKS, blocks = SAMPLE_BLOCKS) {
  mockFetchTasks.mockResolvedValue(tasks)
  mockFetchBlocks.mockResolvedValue(blocks)
  localStorage.setItem('ff_token', 'test-token')
  localStorage.setItem('ff_user', JSON.stringify({ id: 'u1', name: 'Alice Smith' }))

  await act(async () => {
    render(<CalendarPage />, { wrapper: Wrapper })
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — loading
// Tests: Observer pattern (loading state)
// ─────────────────────────────────────────────────────────────────────────────
describe('loading', () => {
  /**
   * CAL-01: Shows loading spinner initially
   * // Input: fetchTasks pending | Oracle: loading spinner visible before data | Pass: spinner found
   */
  it('Shows loading spinner initially', async () => {
    // Arrange
    mockFetchTasks.mockReturnValue(new Promise(() => {}))
    mockFetchBlocks.mockReturnValue(new Promise(() => {}))
    localStorage.setItem('ff_token', 'test-token')
    localStorage.setItem('ff_user', JSON.stringify({ id: 'u1', name: 'Alice' }))

    // Act
    render(<CalendarPage />, { wrapper: Wrapper })

    // Assert — spinner present (animate-spin class or specific loading indicator)
    const spinner = document.querySelector('.animate-spin') ||
                    document.querySelector('[data-testid="loading"]') ||
                    screen.queryByText(/loading/i)
    expect(spinner).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — task rendering
// Tests: Strategy pattern (task → event mapping)
// ─────────────────────────────────────────────────────────────────────────────
describe('task rendering', () => {
  /**
   * CAL-02: Tasks with deadline appear as calendar events
   * // Input: tasks with deadline set | Oracle: event divs rendered in calendar mock | Pass: data-testid="cal-event" found
   */
  it('Tasks with deadline appear as calendar events', async () => {
    // Arrange / Act
    await renderCalendar()

    // Assert
    await waitFor(() => {
      const events = screen.getAllByTestId('cal-event')
      expect(events.length).toBeGreaterThan(0)
    })
  })

  /**
   * CAL-03: Task title appears in event
   * // Input: task with title "One-time task" | Oracle: event contains task title text | Pass: title found in event
   */
  it('Task title appears in event (with ↻ prefix for recurring)', async () => {
    // Arrange / Act
    await renderCalendar()

    // Assert
    await waitFor(() => {
      // Non-recurring title appears directly
      expect(screen.getByText('One-time task')).toBeInTheDocument()
    })
  })

  /**
   * CAL-04: Non-recurring task shows single event
   * // Input: task with recurrence=NONE | Oracle: exactly one event with that title | Pass: only one element found
   */
  it('Non-recurring task shows single event', async () => {
    // Arrange
    const singleTask = [{
      id: 'single', title: 'Single occurrence', priority: 'HIGH',
      status: 'TODO', deadline: TODAY, recurrence: 'NONE', is_complete: false,
    }]

    // Act
    await renderCalendar(singleTask)

    // Assert
    await waitFor(() => {
      const events = screen.getAllByText('Single occurrence')
      expect(events).toHaveLength(1)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — recurrence expansion
// Tests: Strategy pattern (recurrence expansion algorithm)
// ─────────────────────────────────────────────────────────────────────────────
describe('recurrence expansion', () => {
  /**
   * CAL-05: DAILY task with deadline today shows multiple events (today + future dates)
   * // Input: task with recurrence=DAILY, deadline=today | Oracle: more than one cal-event for that task | Pass: multiple events found
   */
  it('DAILY task with deadline today shows multiple events (today + future dates)', async () => {
    // Arrange
    const dailyOnly = [{
      id: 'task-daily-only', title: 'Daily standup',
      priority: 'MEDIUM', status: 'TODO',
      deadline: TODAY, recurrence: 'DAILY', is_complete: false,
    }]

    // Act
    await renderCalendar(dailyOnly)

    // Assert — recurring tasks are expanded to multiple events
    await waitFor(() => {
      const events = screen.getAllByText(/daily standup/i)
      expect(events.length).toBeGreaterThan(1)
    })
  })

  /**
   * CAL-06: WEEKLY task shows events on same day of week across weeks
   * // Input: WEEKLY task with deadline=today | Oracle: multiple events for that title | Pass: 2+ events found
   */
  it('WEEKLY task shows events on same day of week across weeks', async () => {
    // Arrange
    const weeklyOnly = [{
      id: 'task-weekly-only', title: 'Weekly review',
      priority: 'LOW', status: 'TODO',
      deadline: TODAY, recurrence: 'WEEKLY', is_complete: false,
    }]

    // Act
    await renderCalendar(weeklyOnly)

    // Assert
    await waitFor(() => {
      const events = screen.getAllByText(/weekly review/i)
      expect(events.length).toBeGreaterThan(1)
    })
  })

  /**
   * CAL-07: NONE task shows only one event
   * // Input: task with recurrence=NONE | Oracle: exactly one event with that title | Pass: count = 1
   */
  it('NONE task shows only one event', async () => {
    // Arrange
    const noneOnly = [{
      id: 'task-none-only', title: 'One-time only',
      priority: 'HIGH', status: 'TODO',
      deadline: TODAY, recurrence: 'NONE', is_complete: false,
    }]

    // Act
    await renderCalendar(noneOnly)

    // Assert
    await waitFor(() => {
      const events = screen.getAllByText('One-time only')
      expect(events).toHaveLength(1)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — filter checkboxes
// Tests: Observer pattern (filter state → filtered events)
// ─────────────────────────────────────────────────────────────────────────────
describe('filter checkboxes', () => {
  /**
   * CAL-08: "Task Deadlines" checkbox: unchecking hides task events
   * // Input: uncheck "Task Deadlines" | Oracle: task event titles no longer visible | Pass: events gone from DOM
   */
  it('"Task Deadlines" checkbox: unchecking hides task events', async () => {
    // Arrange
    const taskOnly = [{
      id: 'visible-task', title: 'Visible task event',
      priority: 'HIGH', status: 'TODO',
      deadline: TODAY, recurrence: 'NONE', is_complete: false,
    }]
    await renderCalendar(taskOnly)

    // Assert — task visible before unchecking
    await waitFor(() => {
      expect(screen.getByText('Visible task event')).toBeInTheDocument()
    })

    // Act — uncheck Task Deadlines
    const checkbox = screen.getByLabelText(/task deadlines/i) ||
                     Array.from(document.querySelectorAll('input[type="checkbox"]'))
                       .find(c => c.closest('label')?.textContent?.includes('Task Deadlines'))
    if (checkbox) {
      fireEvent.click(checkbox)
    }

    // Assert — task events hidden
    await waitFor(() => {
      expect(screen.queryByText('Visible task event')).not.toBeInTheDocument()
    })
  })

  /**
   * CAL-09: "Time Blocks" checkbox: unchecking hides block events
   * // Input: one block, uncheck "Time Blocks" | Oracle: block title no longer visible | Pass: event gone
   */
  it('"Time Blocks" checkbox: unchecking hides block events', async () => {
    // Arrange
    const blockColor = '#6366f1'
    const blocksWithData = [{
      id: 'block-1',
      title: 'Deep Work Block',
      start_time: `${TODAY}T09:00:00`,
      end_time:   `${TODAY}T10:00:00`,
      color: blockColor,
    }]
    await renderCalendar([], blocksWithData)

    // Assert — block visible before unchecking
    await waitFor(() => {
      expect(screen.getByText('Deep Work Block')).toBeInTheDocument()
    })

    // Act — uncheck Time Blocks checkbox
    const labels = Array.from(document.querySelectorAll('label'))
    const blocksLabel = labels.find(l => l.textContent?.includes('Time Blocks'))
    if (blocksLabel) {
      const checkbox = blocksLabel.querySelector('input[type="checkbox"]')
      if (checkbox) fireEvent.click(checkbox)
    }

    // Assert — block hidden
    await waitFor(() => {
      expect(screen.queryByText('Deep Work Block')).not.toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — view switcher
// Tests: Observer pattern (view state)
// ─────────────────────────────────────────────────────────────────────────────
describe('view switcher', () => {
  /**
   * CAL-10: Day / Week / 4 Day / Month buttons are rendered
   * // Input: component mounted | Oracle: all 4 view buttons visible | Pass: all buttons found
   */
  it('Day / Week / 4 Day / Month buttons are rendered', async () => {
    // Arrange / Act
    await renderCalendar()

    // Assert
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^day$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^week$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /4 day/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^month$/i })).toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — BlockModal
// Tests: Default values, task auto-fill, 4-Pomodoro default, overlap warning,
//        Pomodoro preset buttons, submit guard, cancel
//
// Strategy: tests that need predictable times use a fixed start value injected
// via fireEvent.change; tests that only need "not empty" or relative assertions
// read the actual rendered input values to stay date-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

// Default focusMins from TimerContext with no user prefs = 25
const FOCUS = 25 // must match TimerContext default

/** Parse "YYYY-MM-DDTHH:MM" → minutes since midnight on that date (local) */
function toMins(datetimeLocal) {
  const [, tp = '00:00'] = datetimeLocal.split('T')
  const [h, m] = tp.split(':').map(Number)
  return h * 60 + m
}

/** Parse date part from "YYYY-MM-DDTHH:MM" → "YYYY-MM-DD" */
function datePart(datetimeLocal) { return datetimeLocal.slice(0, 10) }


/** Open the BlockModal via the "New Task Block" sidebar button */
async function openNewModal() {
  await waitFor(() => screen.getByRole('button', { name: /new task block/i }))
  fireEvent.click(screen.getByRole('button', { name: /new task block/i }))
  await waitFor(() => screen.getByText('New Time Block'))
}

/** Get the current value of the start datetime-local input (first one in modal) */
function getStartValue() {
  return document.querySelector('input[type="datetime-local"]')?.value ?? ''
}

/** Get the current value of the end datetime-local input (second one in modal) */
function getEndValue() {
  return document.querySelectorAll('input[type="datetime-local"]')[1]?.value ?? ''
}

describe('BlockModal', () => {

  /**
   * CAL-11: "New Task Block" button opens modal
   * Oracle: "New Time Block" heading visible
   */
  it('CAL-11: "New Task Block" button opens the BlockModal', async () => {
    await renderCalendar()
    await openNewModal()
    expect(screen.getByText('New Time Block')).toBeInTheDocument()
  })

  /**
   * CAL-12: Default start_time when opening empty modal is pre-filled (not blank)
   * Oracle: start input has a non-empty datetime-local value
   */
  it('CAL-12: opening empty modal pre-fills start with current time (not blank)', async () => {
    await renderCalendar()
    await openNewModal()
    expect(getStartValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  /**
   * CAL-13: Default end_time = start + 4 × focusMins (100 min)
   * Oracle: end − start = 100 minutes exactly
   */
  it('CAL-13: opening empty modal sets end = start + 4 × focusMins (100 min)', async () => {
    await renderCalendar()
    await openNewModal()

    const startVal = getStartValue()
    const endVal   = getEndValue()
    expect(startVal).toBeTruthy()
    expect(endVal).toBeTruthy()

    // Compute difference in minutes
    const [sdp, stp] = startVal.split('T')
    const [edp, etp] = endVal.split('T')
    const [sy, sm, sd] = sdp.split('-').map(Number)
    const [ey, em, ed] = edp.split('-').map(Number)
    const [sh, smi]    = stp.split(':').map(Number)
    const [eh, emi]    = etp.split(':').map(Number)
    const startMs = new Date(sy, sm-1, sd, sh, smi).getTime()
    const endMs   = new Date(ey, em-1, ed, eh, emi).getTime()
    const diffMins = (endMs - startMs) / 60000

    expect(diffMins).toBe(FOCUS * 4) // 100 minutes
  })

  /**
   * CAL-14: start is rounded to next 15-minute boundary
   * Oracle: start minutes are a multiple of 15
   */
  it('CAL-14: default start time is rounded to the nearest 15-minute boundary', async () => {
    await renderCalendar()
    await openNewModal()
    const startVal = getStartValue()
    const mins = toMins(startVal) % 15
    expect(mins).toBe(0) // must be on a 15-min boundary
  })

  /**
   * CAL-15: Linking a task with deadline + due_time auto-fills start from task
   * Task: deadline=2026-04-10, due_time=14:00
   * Oracle: start = "2026-04-10T14:00", end = "2026-04-10T15:40" (+100 min)
   */
  it('CAL-15: selecting a task with due_time auto-fills start = deadline+due_time and end = +100 min', async () => {
    const tasksWithTime = [{
      id: 'task-timed', title: 'Design Review', priority: 'HIGH',
      status: 'TODO', deadline: '2026-04-10', due_time: '14:00',
      recurrence: 'NONE', is_complete: false,
    }]
    await renderCalendar(tasksWithTime)
    await openNewModal()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task-timed' } })

    await waitFor(() => {
      // Title auto-filled into the text input (not the select)
      const titleInput = document.querySelector('input[placeholder="e.g. Deep Work Session"]')
      expect(titleInput?.value).toBe('Design Review')
      // Start = deadline + due_time
      expect(screen.getByDisplayValue('2026-04-10T14:00')).toBeInTheDocument()
      // End = start + 4 × 25 = +100 min → 15:40
      expect(screen.getByDisplayValue('2026-04-10T15:40')).toBeInTheDocument()
    })
  })

  /**
   * CAL-16: Linking a task with deadline but NO due_time uses rounded-now as time, date from task
   * Task: deadline=2026-04-10, no due_time
   * Oracle: start date part = "2026-04-10", end = start + 100 min
   */
  it('CAL-16: task with deadline but no due_time: start date = task deadline, end = +100 min', async () => {
    const tasksNoTime = [{
      id: 'task-no-time', title: 'Planning Session', priority: 'MEDIUM',
      status: 'TODO', deadline: '2026-04-10', due_time: null,
      recurrence: 'NONE', is_complete: false,
    }]
    await renderCalendar(tasksNoTime)
    await openNewModal()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task-no-time' } })

    await waitFor(() => {
      const startVal = getStartValue()
      const endVal   = getEndValue()
      expect(datePart(startVal)).toBe('2026-04-10')

      // end − start must still be 100 min
      const [sdp, stp] = startVal.split('T')
      const [edp, etp] = endVal.split('T')
      const [sy, sm, sd] = sdp.split('-').map(Number)
      const [ey, em, ed] = edp.split('-').map(Number)
      const [sh, smi]    = stp.split(':').map(Number)
      const [eh, emi]    = etp.split(':').map(Number)
      const diffMins = (new Date(ey,em-1,ed,eh,emi) - new Date(sy,sm-1,sd,sh,smi)) / 60000
      expect(diffMins).toBe(FOCUS * 4)
    })
  })

  /**
   * CAL-17: "1 🍅" preset sets end = start + 25 min
   * Use a fixed start to make the assertion deterministic.
   */
  it('CAL-17: "1 🍅" preset sets end = start + 25 min', async () => {
    await renderCalendar()
    await openNewModal()

    const startInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(startInputs[0], { target: { value: '2026-06-01T10:00' } })

    fireEvent.click(screen.getByRole('button', { name: /1 🍅/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('2026-06-01T10:25')).toBeInTheDocument()
    })
  })

  /**
   * CAL-18: "2 🍅" preset sets end = start + 50 min
   */
  it('CAL-18: "2 🍅" preset sets end = start + 50 min', async () => {
    await renderCalendar()
    await openNewModal()

    const startInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(startInputs[0], { target: { value: '2026-06-01T10:00' } })

    fireEvent.click(screen.getByRole('button', { name: /2 🍅/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('2026-06-01T10:50')).toBeInTheDocument()
    })
  })

  /**
   * CAL-19: "4 🍅" preset sets end = start + 100 min
   */
  it('CAL-19: "4 🍅" preset sets end = start + 100 min', async () => {
    await renderCalendar()
    await openNewModal()

    const startInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(startInputs[0], { target: { value: '2026-06-01T10:00' } })

    fireEvent.click(screen.getByRole('button', { name: /4 🍅/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('2026-06-01T11:40')).toBeInTheDocument()
    })
  })

  /**
   * CAL-20: Overlap warning shown and Create disabled when times conflict
   * Existing: 09:30–10:00. New: 09:00–09:45 → overlaps.
   */
  it('CAL-20: overlap warning shown and Create disabled when times conflict', async () => {
    const conflictingBlocks = [{
      id: 'existing-b', title: 'Morning Standup',
      start_time: '2026-04-05T09:30', end_time: '2026-04-05T10:00', color: '#6366f1',
    }]
    await renderCalendar([], conflictingBlocks)
    await openNewModal()

    const dtInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(dtInputs[0], { target: { value: '2026-04-05T09:00' } })
    fireEvent.change(dtInputs[1], { target: { value: '2026-04-05T09:45' } })

    await waitFor(() => {
      expect(screen.getByText(/overlaps with/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()
  })

  /**
   * CAL-21: Regression — 12:50 AM vs 09:30 AM must NOT trigger overlap warning
   */
  it('CAL-21: no false-positive overlap for 12:50 AM vs 09:30 AM (regression)', async () => {
    const morningBlock = [{
      id: 'morning', title: 'Morning Standup',
      start_time: '2026-04-05T09:30', end_time: '2026-04-05T10:00', color: '#6366f1',
    }]
    await renderCalendar([], morningBlock)
    await openNewModal()

    const dtInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(dtInputs[0], { target: { value: '2026-04-05T00:50' } })
    fireEvent.change(dtInputs[1], { target: { value: '2026-04-05T01:15' } })

    await waitFor(() => {
      expect(screen.queryByText(/overlaps with/i)).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create/i })).not.toBeDisabled()
  })

  /**
   * CAL-22: Overlap warning clears after resolving the conflict
   */
  it('CAL-22: overlap warning clears when conflict is resolved by changing times', async () => {
    const conflictingBlocks = [{
      id: 'existing-c', title: 'Team Sync',
      start_time: '2026-04-05T09:30', end_time: '2026-04-05T10:00', color: '#6366f1',
    }]
    await renderCalendar([], conflictingBlocks)
    await openNewModal()

    const dtInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(dtInputs[0], { target: { value: '2026-04-05T09:00' } })
    fireEvent.change(dtInputs[1], { target: { value: '2026-04-05T09:45' } })
    await waitFor(() => expect(screen.getByText(/overlaps with/i)).toBeInTheDocument())

    fireEvent.change(dtInputs[0], { target: { value: '2026-04-05T11:00' } })
    fireEvent.change(dtInputs[1], { target: { value: '2026-04-05T12:00' } })

    await waitFor(() => {
      expect(screen.queryByText(/overlaps with/i)).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create/i })).not.toBeDisabled()
  })

  /**
   * CAL-23: Cancel button closes the modal
   */
  it('CAL-23: Cancel button closes the modal', async () => {
    await renderCalendar()
    await openNewModal()

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText('New Time Block')).not.toBeInTheDocument()
    })
  })

  /**
   * CAL-24: Adjacent blocks (touching boundary) are NOT flagged as overlapping
   * New: 10:00–11:00, existing ends exactly at 10:00
   */
  it('CAL-24: adjacent blocks touching at boundary are not flagged as overlapping', async () => {
    const adjacentBlock = [{
      id: 'adj', title: 'Prev Block',
      start_time: '2026-04-05T09:00', end_time: '2026-04-05T10:00', color: '#6366f1',
    }]
    await renderCalendar([], adjacentBlock)
    await openNewModal()

    const dtInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(dtInputs[0], { target: { value: '2026-04-05T10:00' } })
    fireEvent.change(dtInputs[1], { target: { value: '2026-04-05T11:00' } })

    await waitFor(() => {
      expect(screen.queryByText(/overlaps with/i)).not.toBeInTheDocument()
    })
  })
})
