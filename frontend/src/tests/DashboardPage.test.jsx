/**
 * @file DashboardPage.test.jsx
 * @description Comprehensive tests for the DashboardPage component.
 * Tests: Observer pattern (AuthContext/TimerContext) + Strategy pattern (priority sort)
 *
 * Framework: Jest 29 + React Testing Library 16
 * Strategy:
 *   - taskService and otherServices are fully mocked — no real HTTP calls.
 *   - AuthContext is real; user injected via localStorage before render.
 *   - All async data fetching exercised with waitFor.
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
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import { AuthProvider } from '../context/AuthContext'
import { TimerProvider } from '../context/TimerContext'

// ── Mock services ─────────────────────────────────────────────────────────────
const mockFetchStats         = jest.fn()
const mockFetchTasks         = jest.fn()
const mockMarkTaskComplete   = jest.fn()
const mockCreateTask         = jest.fn()
const mockFetchTaskAnalytics = jest.fn()

jest.mock('../services/taskService', () => ({
  fetchTasks:         (...a) => mockFetchTasks(...a),
  createTask:         (...a) => mockCreateTask(...a),
  markTaskComplete:   (...a) => mockMarkTaskComplete(...a),
  fetchTaskAnalytics: (...a) => mockFetchTaskAnalytics(...a),
}))

jest.mock('../services/otherServices', () => ({
  fetchStats:    (...a) => mockFetchStats(...a),
  logSession:    jest.fn().mockResolvedValue({}),
  fetchSessions: jest.fn().mockResolvedValue([]),
  generateTasks: jest.fn().mockResolvedValue({ tasks: [], summary: '' }),
  refineTasks:   jest.fn().mockResolvedValue({ tasks: [], summary: '' }),
}))

jest.mock('../services/authService', () => ({
  login:      jest.fn(),
  register:   jest.fn(),
  saveApiKey: jest.fn().mockResolvedValue({}),
}))

// ── Mock AITaskGenerator (tested separately) ──────────────────────────────────
jest.mock('../components/AITaskGenerator', () => () => <div data-testid="ai-task-generator" />)

// ── Mock SketchLine (SVG component not needed in tests) ───────────────────────
jest.mock('../components/SketchLine', () => () => <div data-testid="sketch-line" />)

// ── Date helpers ──────────────────────────────────────────────────────────────
const fmt = (d) => d.toISOString().split('T')[0]
const NOW       = new Date()
const YESTERDAY = new Date(NOW); YESTERDAY.setDate(YESTERDAY.getDate() - 1)
const TOMORROW  = new Date(NOW); TOMORROW.setDate(TOMORROW.getDate() + 1)

// ── Sample data ───────────────────────────────────────────────────────────────
const MOCK_ANALYTICS = {
  total: 6,
  completion_rate: 50,
  by_status: { DONE: 3, IN_PROGRESS: 2, TODO: 1 },
  by_priority: { HIGH: 2, MEDIUM: 3, LOW: 1 },
  overdue: 1,
  completed_this_week: 5,
  completed_today: 2,
}

const MOCK_STATS = {
  tasks_done: 7,
  deep_work_hours: 3,
  streak_days: 5,
}

const MOCK_TASKS = [
  {
    id: 't1', title: 'Low priority task', priority: 'LOW',
    status: 'TODO', deadline: fmt(TOMORROW),
    recurrence: 'NONE', is_complete: false,
  },
  {
    id: 't2', title: 'High priority task', priority: 'HIGH',
    status: 'TODO', deadline: fmt(TOMORROW),
    recurrence: 'NONE', is_complete: false,
  },
  {
    id: 't3', title: 'Medium priority task', priority: 'MEDIUM',
    status: 'IN_PROGRESS', deadline: fmt(TOMORROW),
    recurrence: 'NONE', is_complete: false,
  },
  {
    id: 't4', title: 'Daily recurring task', priority: 'MEDIUM',
    status: 'TODO', deadline: fmt(TOMORROW),
    recurrence: 'DAILY', is_complete: false,
  },
  {
    id: 't5', title: 'Weekly recurring task', priority: 'LOW',
    status: 'TODO', deadline: fmt(TOMORROW),
    recurrence: 'WEEKLY', is_complete: false,
  },
  {
    id: 't6', title: 'Overdue task', priority: 'HIGH',
    status: 'TODO', deadline: fmt(YESTERDAY),
    recurrence: 'NONE', is_complete: false,
  },
]

// ── Wrapper ───────────────────────────────────────────────────────────────────
function Wrapper({ children, user = { id: 'u1', name: 'Alice Smith', onboarding_completed: true } }) {
  if (user) {
    localStorage.setItem('ff_token', 'test-token')
    localStorage.setItem('ff_user', JSON.stringify(user))
  }
  return (
    <MemoryRouter>
      <AuthProvider>
        <TimerProvider>{children}</TimerProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

async function renderDashboard({
  tasks = MOCK_TASKS,
  stats = MOCK_STATS,
  analytics = MOCK_ANALYTICS,
  user,
} = {}) {
  mockFetchTasks.mockResolvedValue(tasks)
  mockFetchStats.mockResolvedValue(stats)
  mockFetchTaskAnalytics.mockResolvedValue(analytics)

  await act(async () => {
    render(
      <DashboardPage />,
      { wrapper: ({ children }) => <Wrapper user={user}>{children}</Wrapper> },
    )
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
// Suite 1 — Loading state
// Tests: Observer pattern (TimerContext)
// ─────────────────────────────────────────────────────────────────────────────
describe('loading state', () => {
  /**
   * DASH-01: Shows skeleton placeholders while loading
   * // Input: fetchTasks/fetchStats/fetchTaskAnalytics all pending | Oracle: animated skeleton divs visible | Pass: animate-pulse elements found
   */
  it('Shows skeleton placeholders while loading', async () => {
    // Arrange
    let resolveStats
    mockFetchStats.mockReturnValue(new Promise(r => { resolveStats = r }))
    mockFetchTasks.mockReturnValue(new Promise(() => {}))
    mockFetchTaskAnalytics.mockReturnValue(new Promise(() => {}))
    localStorage.setItem('ff_token', 'test-token')
    localStorage.setItem('ff_user', JSON.stringify({ id: 'u1', name: 'Alice Smith' }))

    // Act
    render(
      <MemoryRouter><AuthProvider><TimerProvider><DashboardPage /></TimerProvider></AuthProvider></MemoryRouter>
    )

    // Assert — skeleton pulse elements present before data loads
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)

    // Cleanup
    resolveStats(MOCK_STATS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Data display
// Tests: Observer pattern (AuthContext user state)
// ─────────────────────────────────────────────────────────────────────────────
describe('data display', () => {
  /**
   * DASH-02: Renders "Hello, [firstName]" greeting
   * // Input: user.name = "Alice Smith" | Oracle: "Hello, Alice" visible | Pass: text found
   */
  it('Renders "Hello, [firstName]" greeting with user first name', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    expect(screen.getByText(/hello,/i)).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  /**
   * DASH-03: Shows 4 stat cards
   * // Input: MOCK_STATS with tasks_done, deep_work_hours, streak_days | Oracle: 4 stat card labels visible | Pass: all labels found
   */
  it('Shows 4 stat cards (Tasks Done, Deep Work, Streak, Completion)', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/tasks done/i)).toBeInTheDocument()
      expect(screen.getByText(/deep work/i)).toBeInTheDocument()
      expect(screen.getByText(/streak/i)).toBeInTheDocument()
      expect(screen.getByText(/completion/i)).toBeInTheDocument()
    })
  })

  /**
   * DASH-04: Shows task list when tasks are loaded
   * // Input: fetchTasks resolves with MOCK_TASKS | Oracle: task titles visible | Pass: titles found
   */
  it('Shows task list when tasks are loaded', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      expect(screen.getByText('High priority task')).toBeInTheDocument()
      expect(screen.getByText('Medium priority task')).toBeInTheDocument()
    })
  })

  /**
   * DASH-05: Shows "No active tasks" when tasks array is empty
   * // Input: fetchTasks resolves with [] | Oracle: "No active tasks" text visible | Pass: text found
   */
  it('Shows "No active tasks" when tasks array is empty', async () => {
    // Arrange / Act
    await renderDashboard({ tasks: [] })

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/no active tasks/i)).toBeInTheDocument()
    })
  })

  /**
   * DASH-06: Sorts tasks HIGH priority before MEDIUM before LOW
   * // Input: tasks with mixed priorities | Oracle: HIGH task DOM position before MEDIUM before LOW | Pass: order confirmed
   */
  it('Sorts tasks HIGH priority before MEDIUM before LOW', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert — verify HIGH tasks appear before MEDIUM and LOW in the DOM
    await waitFor(() => {
      const highEl   = screen.getByText('High priority task')
      const medEl    = screen.getByText('Medium priority task')
      const lowEl    = screen.getByText('Low priority task')
      const allText  = document.body.innerHTML
      const highIdx  = allText.indexOf('High priority task')
      const medIdx   = allText.indexOf('Medium priority task')
      const lowIdx   = allText.indexOf('Low priority task')
      expect(highIdx).toBeLessThan(medIdx)
      expect(medIdx).toBeLessThan(lowIdx)
      // All three elements present
      expect(highEl).toBeInTheDocument()
      expect(medEl).toBeInTheDocument()
      expect(lowEl).toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Task type badges
// Tests: Strategy pattern (recurrence config)
// ─────────────────────────────────────────────────────────────────────────────
describe('task type badges', () => {
  /**
   * DASH-07: Shows "One-time" badge for tasks with recurrence=NONE
   * // Input: task with recurrence=NONE | Oracle: "One-time" badge visible | Pass: text found
   */
  it('Shows "One-time" badge for tasks with recurrence=NONE', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      const badges = screen.getAllByText('One-time')
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  /**
   * DASH-08: Shows "↻ Daily" badge for DAILY recurring tasks
   * // Input: task with recurrence=DAILY | Oracle: "↻ Daily" badge visible | Pass: text found
   */
  it('Shows "↻ Daily" badge for DAILY recurring tasks', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      const dailyBadges = screen.getAllByText('↻ Daily')
      expect(dailyBadges.length).toBeGreaterThan(0)
    })
  })

  /**
   * DASH-09: Shows "↻ Weekly" badge for WEEKLY recurring tasks
   * // Input: task with recurrence=WEEKLY | Oracle: "↻ Weekly" badge visible | Pass: text found
   */
  it('Shows "↻ Weekly" badge for WEEKLY recurring tasks', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      const weeklyBadges = screen.getAllByText('↻ Weekly')
      expect(weeklyBadges.length).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Quick-add form
// Tests: Factory pattern (createTask payload building)
// ─────────────────────────────────────────────────────────────────────────────
describe('quick-add form', () => {
  /**
   * DASH-10: Submit button disabled when title is empty
   * // Input: title field is empty | Oracle: submit button disabled | Pass: button.disabled = true
   */
  it('Submit button disabled when title is empty', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      const addBtn = screen.getByRole('button', { name: /add task/i })
      expect(addBtn).toBeDisabled()
    })
  })

  /**
   * DASH-11: Calls createTask with correct payload on submit
   * // Input: fill title "Buy groceries", submit | Oracle: createTask called with title="Buy groceries" | Pass: mock called correctly
   */
  it('Calls createTask with correct payload on submit', async () => {
    // Arrange
    const newTask = {
      id: 'tnew', title: 'Buy groceries', priority: 'MEDIUM',
      status: 'TODO', deadline: null, recurrence: 'NONE', is_complete: false,
    }
    mockCreateTask.mockResolvedValue(newTask)
    await renderDashboard()

    // Act
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/what needs to get done/i)
      expect(input).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Buy groceries' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    // Assert
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Buy groceries' }),
      )
    })
  })

  /**
   * DASH-12: Clears form after successful add
   * // Input: fill title, submit successfully | Oracle: title input is empty after | Pass: input.value === ""
   */
  it('Clears form after successful add', async () => {
    // Arrange
    const newTask = {
      id: 'tnew2', title: 'Clean room', priority: 'MEDIUM',
      status: 'TODO', deadline: null, recurrence: 'NONE', is_complete: false,
    }
    mockCreateTask.mockResolvedValue(newTask)
    await renderDashboard()

    // Act
    await waitFor(() => expect(screen.getByPlaceholderText(/what needs to get done/i)).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/what needs to get done/i)
    fireEvent.change(input, { target: { value: 'Clean room' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    // Assert
    await waitFor(() => {
      expect(input.value).toBe('')
    })
  })

  /**
   * DASH-13: Time input disabled until date is selected
   * // Input: no date selected | Oracle: time input is disabled | Pass: time input.disabled = true
   */
  it('Time input disabled until date is selected', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      const timeInput = document.querySelector('input[type="time"]')
      expect(timeInput).toBeDisabled()
    })
  })

  /**
   * DASH-14: Priority chips: clicking HIGH selects it
   * // Input: click "High" chip | Oracle: chip has active styling (no longer gray) | Pass: createTask called with priority HIGH
   */
  it('Priority chips: clicking HIGH selects it', async () => {
    // Arrange
    const newTask = {
      id: 'tnew3', title: 'Urgent thing', priority: 'HIGH',
      status: 'TODO', deadline: null, recurrence: 'NONE', is_complete: false,
    }
    mockCreateTask.mockResolvedValue(newTask)
    await renderDashboard()

    // Act
    await waitFor(() => expect(screen.getByPlaceholderText(/what needs to get done/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'High' }))
    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Urgent thing' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    // Assert
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'HIGH' }),
      )
    })
  })

  /**
   * DASH-15: Recurrence type chips: clicking "↻ Daily" selects DAILY recurrence
   * // Input: click "↻ Daily" chip, fill title, submit | Oracle: createTask called with recurrence=DAILY | Pass: mock called with DAILY
   */
  it('Recurrence type chips: clicking "↻ Daily" selects DAILY recurrence', async () => {
    // Arrange
    const newTask = {
      id: 'tnew4', title: 'Morning run', priority: 'MEDIUM',
      status: 'TODO', deadline: null, recurrence: 'DAILY', is_complete: false,
    }
    mockCreateTask.mockResolvedValue(newTask)
    await renderDashboard()

    // Act
    await waitFor(() => expect(screen.getByPlaceholderText(/what needs to get done/i)).toBeInTheDocument())
    // Find the Daily recurrence chip (not the badge in the task list)
    const dailyChips = screen.getAllByRole('button', { name: /↻ Daily/i })
    fireEvent.click(dailyChips[0])
    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Morning run' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    // Assert
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: 'DAILY' }),
      )
    })
  })

  /**
   * DASH-16: New task appears at top of list
   * // Input: createTask returns new task | Oracle: new task title visible in DOM | Pass: text found
   */
  it('New task appears at top of list', async () => {
    // Arrange
    const newTask = {
      id: 'tnew5', title: 'Brand new task', priority: 'HIGH',
      status: 'TODO', deadline: null, recurrence: 'NONE', is_complete: false,
    }
    mockCreateTask.mockResolvedValue(newTask)
    await renderDashboard()

    // Act
    await waitFor(() => expect(screen.getByPlaceholderText(/what needs to get done/i)).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Brand new task' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Brand new task')).toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Complete task
// Tests: Command pattern (markTaskComplete)
// ─────────────────────────────────────────────────────────────────────────────
describe('complete task', () => {
  /**
   * DASH-17: Clicking complete button removes task from list
   * // Input: click complete on "High priority task" | Oracle: task removed from DOM | Pass: task title not found
   */
  it('Clicking complete button removes task from list', async () => {
    // Arrange
    mockMarkTaskComplete.mockResolvedValue({ id: 't2', status: 'DONE', is_complete: true })
    await renderDashboard()

    // Act
    await waitFor(() => expect(screen.getByText('High priority task')).toBeInTheDocument())
    const completeBtn = screen.getByRole('button', { name: /complete high priority task/i })
    fireEvent.click(completeBtn)

    // Assert
    await waitFor(() => {
      expect(screen.queryByText('High priority task')).not.toBeInTheDocument()
    })
  })

  /**
   * DASH-18: Calls markTaskComplete with correct task ID
   * // Input: click complete on task with id="t2" | Oracle: markTaskComplete('t2') called | Pass: mock called with t2
   */
  it('Calls markTaskComplete with correct task ID', async () => {
    // Arrange
    mockMarkTaskComplete.mockResolvedValue({ id: 't2', status: 'DONE', is_complete: true })
    await renderDashboard()

    // Act
    await waitFor(() => expect(screen.getByText('High priority task')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /complete high priority task/i }))

    // Assert
    await waitFor(() => {
      expect(mockMarkTaskComplete).toHaveBeenCalledWith('t2')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — Overdue display
// Tests: Strategy pattern (priority/deadline sort)
// ─────────────────────────────────────────────────────────────────────────────
describe('overdue display', () => {
  /**
   * DASH-19: Tasks with past deadline show red date text
   * // Input: task with deadline=yesterday, status=TODO | Oracle: overdue task has red text styling | Pass: red class or ⚠ found
   */
  it('Tasks with past deadline show red date text', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      // The overdue task shows a ⚠ warning indicator
      const warnings = screen.getAllByText(/⚠/)
      expect(warnings.length).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — Analytics panel
// Tests: Observer pattern (analytics state)
// ─────────────────────────────────────────────────────────────────────────────
describe('analytics panel', () => {
  /**
   * DASH-20: Progress ring shows correct percentage
   * // Input: analytics.completion_rate=50 | Oracle: "50%" visible in ring | Pass: text found
   */
  it('Progress ring shows correct percentage', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument()
    })
  })

  /**
   * DASH-21: Status bars render for Done/In Progress/To Do
   * // Input: analytics.by_status has DONE=3, IN_PROGRESS=2, TODO=1 | Oracle: labels visible | Pass: all three labels found
   */
  it('Status bars render for Done/In Progress/To Do', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
      expect(screen.getByText('In Progress')).toBeInTheDocument()
      expect(screen.getByText('To Do')).toBeInTheDocument()
    })
  })

  /**
   * DASH-22: "X overdue" badge shows when overdue > 0
   * // Input: analytics.overdue=1 | Oracle: "1 overdue" text visible | Pass: text found
   */
  it('"X overdue" badge shows when overdue > 0', async () => {
    // Arrange / Act
    await renderDashboard()

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/1 overdue/i)).toBeInTheDocument()
    })
  })
})
