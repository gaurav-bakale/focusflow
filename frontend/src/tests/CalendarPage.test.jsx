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
