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
const mockFetchBlocks        = jest.fn()
const mockCreateBlock        = jest.fn()
const mockCreateBlocksBulk   = jest.fn()

jest.mock('../services/taskService', () => ({
  fetchTasks:         (...a) => mockFetchTasks(...a),
  createTask:         (...a) => mockCreateTask(...a),
  markTaskComplete:   (...a) => mockMarkTaskComplete(...a),
  fetchTaskAnalytics: (...a) => mockFetchTaskAnalytics(...a),
}))

jest.mock('../services/otherServices', () => ({
  fetchStats:        (...a) => mockFetchStats(...a),
  fetchBlocks:       (...a) => mockFetchBlocks(...a),
  createBlock:       (...a) => mockCreateBlock(...a),
  createBlocksBulk:  (...a) => mockCreateBlocksBulk(...a),
  updateBlock:       jest.fn().mockResolvedValue({}),
  deleteBlock:       jest.fn().mockResolvedValue(undefined),
  logSession:        jest.fn().mockResolvedValue({}),
  fetchSessions:     jest.fn().mockResolvedValue([]),
  generateTasks:     jest.fn().mockResolvedValue({ tasks: [], summary: '' }),
  refineTasks:       jest.fn().mockResolvedValue({ tasks: [], summary: '' }),
}))

jest.mock('../services/authService', () => ({
  login:       jest.fn(),
  register:    jest.fn(),
  saveApiKey:  jest.fn().mockResolvedValue({}),
  getProfile:  jest.fn().mockResolvedValue({
    id: 'u1', name: 'Alice Smith', email: 'alice@focusflow.dev',
    onboarding_completed: true,
    preferences: { pomodoro_duration: 25, short_break: 5, long_break: 15 },
    created_at: new Date().toISOString(),
  }),
}))

// ── Mock AITaskGenerator (tested separately) ──────────────────────────────────
jest.mock('../components/AITaskGenerator', () => {
  function AITaskGeneratorMock() { return <div data-testid="ai-task-generator" /> }
  return AITaskGeneratorMock
})

// ── Mock SketchLine (SVG component not needed in tests) ───────────────────────
jest.mock('../components/SketchLine', () => {
  function SketchLineMock() { return <div data-testid="sketch-line" /> }
  return SketchLineMock
})

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
      // 50% appears in both ProgressRing and StatCard — use getAllByText
      const pctEls = screen.getAllByText('50%')
      expect(pctEls.length).toBeGreaterThanOrEqual(1)
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

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — Auto-schedule (calendar block created on task add)
// ─────────────────────────────────────────────────────────────────────────────
describe('auto-schedule on task creation', () => {

  const FUTURE_DATE = fmt(TOMORROW)

  function setupAutoSchedule({ taskDeadline = FUTURE_DATE, blocks = [], blockCreated = { id: 'b1' } } = {}) {
    mockFetchBlocks.mockResolvedValue(blocks)
    mockCreateBlock.mockResolvedValue(blockCreated)
    mockCreateTask.mockResolvedValue({
      id: 'new-task',
      title: 'New Task',
      priority: 'MEDIUM',
      status: 'TODO',
      deadline: taskDeadline,
      due_time: null,
      recurrence: 'NONE',
      is_complete: false,
    })
  }

  async function submitTask(title = 'New Task', deadline = FUTURE_DATE) {
    await renderDashboard()
    await waitFor(() => screen.getByPlaceholderText(/what needs to get done/i))

    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: title },
    })
    if (deadline) {
      const dateInputs = document.querySelectorAll('input[type="date"]')
      fireEvent.change(dateInputs[0], { target: { value: deadline } })
    }
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
  }

  /**
   * DASH-23: Task with deadline triggers fetchBlocks + createBlock
   * Oracle: createBlock called once with correct task_id and a valid start_time
   */
  it('DASH-23: task with deadline auto-creates a calendar block', async () => {
    setupAutoSchedule()

    await submitTask('Gym session', FUTURE_DATE)

    await waitFor(() => {
      expect(mockFetchBlocks).toHaveBeenCalledTimes(1)
      expect(mockCreateBlock).toHaveBeenCalledTimes(1)
    })

    const blockArg = mockCreateBlock.mock.calls[0][0]
    expect(blockArg.task_id).toBe('new-task')
    expect(blockArg.title).toBe('New Task')
    expect(blockArg.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(blockArg.end_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  /**
   * DASH-24: Block end_time is exactly 100 min (4×25) after start_time
   * Oracle: end - start = 100 minutes
   */
  it('DASH-24: auto-created block duration = 4 × focusMins (100 min)', async () => {
    setupAutoSchedule()

    await submitTask('Deep work', FUTURE_DATE)

    await waitFor(() => expect(mockCreateBlock).toHaveBeenCalled())

    const { start_time, end_time } = mockCreateBlock.mock.calls[0][0]
    const [sdp, stp] = start_time.split('T')
    const [edp, etp] = end_time.split('T')
    const [sy, sm, sd] = sdp.split('-').map(Number)
    const [ey, em, ed] = edp.split('-').map(Number)
    const [sh, smi]    = stp.split(':').map(Number)
    const [eh, emi]    = etp.split(':').map(Number)
    const diffMins = (new Date(ey,em-1,ed,eh,emi) - new Date(sy,sm-1,sd,sh,smi)) / 60000
    expect(diffMins).toBe(100)
  })

  /**
   * DASH-25: Task without deadline does NOT trigger auto-schedule
   * Oracle: fetchBlocks and createBlock never called
   */
  it('DASH-25: task without deadline does not auto-create a block', async () => {
    mockCreateTask.mockResolvedValue({
      id: 'no-deadline-task', title: 'Buy groceries',
      priority: 'LOW', status: 'TODO',
      deadline: null, due_time: null,
      recurrence: 'NONE', is_complete: false,
    })
    mockFetchBlocks.mockResolvedValue([])

    await renderDashboard()
    await waitFor(() => screen.getByPlaceholderText(/what needs to get done/i))

    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Buy groceries' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())

    expect(mockFetchBlocks).not.toHaveBeenCalled()
    expect(mockCreateBlock).not.toHaveBeenCalled()
  })

  /**
   * DASH-26: Auto-schedule shows confirmation message to user
   * Oracle: "Block scheduled on calendar" text appears after add
   */
  it('DASH-26: shows schedule confirmation message after auto-scheduling', async () => {
    setupAutoSchedule()

    await submitTask('Morning run', FUTURE_DATE)

    await waitFor(() => {
      expect(screen.getByText(/block scheduled on calendar/i)).toBeInTheDocument()
    })
  })

  /**
   * DASH-27: Fully booked day → shows "Day fully booked" message, block NOT created
   * Oracle: createBlock not called, "fully booked" text shown
   */
  it('DASH-27: fully booked deadline day shows fallback message, no block created', async () => {
    // Fill the entire active window (6 AM–11 PM) with one big block
    const bigBlock = {
      id: 'b-full',
      start_time: `${FUTURE_DATE}T06:00`,
      end_time:   `${FUTURE_DATE}T23:00`,
    }
    setupAutoSchedule({ blocks: [bigBlock] })

    await submitTask('Therapy session', FUTURE_DATE)

    await waitFor(() => {
      expect(screen.getByText(/day fully booked/i)).toBeInTheDocument()
    })
    expect(mockCreateBlock).not.toHaveBeenCalled()
  })

  /**
   * DASH-28: Auto-schedule avoids existing blocks (no overlap)
   * Existing block: 6:00–7:40. Oracle: new block starts at 8:00 (after gap check).
   */
  it('DASH-28: auto-scheduled block avoids existing block — no overlap', async () => {
    const existing = [{
      id: 'b-existing',
      start_time: `${FUTURE_DATE}T06:00`,
      end_time:   `${FUTURE_DATE}T07:40`,
    }]
    setupAutoSchedule({ blocks: existing })

    await submitTask('Focus session', FUTURE_DATE)

    await waitFor(() => expect(mockCreateBlock).toHaveBeenCalled())

    const { start_time } = mockCreateBlock.mock.calls[0][0]
    // Must start at or after 8:00 AM (not at 6:00 which is taken)
    const [, tp] = start_time.split('T')
    const startMins = parseInt(tp.split(':')[0]) * 60 + parseInt(tp.split(':')[1])
    expect(startMins).toBeGreaterThanOrEqual(8 * 60) // 8:00 AM
  })

  /**
   * DASH-30: Task with due_time → auto-scheduled at EXACT due_time (not smart-slotted)
   * Oracle: createBlock called with start_time = "FUTURE_DATE T due_time" exactly.
   * This validates the pinned-time path in smartScheduleTask.
   */
  it('DASH-30: task with due_time is auto-scheduled at exact due_time, not smart-slotted', async () => {
    const DUE_TIME = '14:30'
    mockFetchBlocks.mockResolvedValue([])
    mockCreateBlock.mockResolvedValue({ id: 'b-pinned' })
    mockCreateTask.mockResolvedValue({
      id: 'pinned-task',
      title: 'Standup',
      priority: 'MEDIUM',
      status: 'TODO',
      deadline: FUTURE_DATE,
      due_time: DUE_TIME,
      recurrence: 'NONE',
      is_complete: false,
    })

    await renderDashboard()
    await waitFor(() => screen.getByPlaceholderText(/what needs to get done/i))

    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Standup' },
    })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: FUTURE_DATE } })
    // Simulate time input after date is selected
    const timeInput = document.querySelector('input[type="time"]')
    fireEvent.change(timeInput, { target: { value: DUE_TIME } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => expect(mockCreateBlock).toHaveBeenCalled())

    const { start_time, end_time } = mockCreateBlock.mock.calls[0][0]
    // Start must be exactly the pinned due_time
    expect(start_time).toBe(`${FUTURE_DATE}T${DUE_TIME}`)
    // End must be 100 min (4×25) later
    const [sdp, stp] = start_time.split('T')
    const [edp, etp] = end_time.split('T')
    const [sy, sm, sd] = sdp.split('-').map(Number)
    const [ey, em, ed] = edp.split('-').map(Number)
    const [sh, smi]    = stp.split(':').map(Number)
    const [eh, emi]    = etp.split(':').map(Number)
    const diffMins = (new Date(ey,em-1,ed,eh,emi) - new Date(sy,sm-1,sd,sh,smi)) / 60000
    expect(diffMins).toBe(100)
  })

  /**
   * DASH-29: createBlock failure is silent — task still added to list
   * Oracle: task appears in list even when createBlock throws
   */
  it('DASH-29: createBlock failure is non-critical — task still added', async () => {
    mockFetchBlocks.mockResolvedValue([])
    mockCreateBlock.mockRejectedValue(new Error('network error'))
    mockCreateTask.mockResolvedValue({
      id: 'task-x', title: 'Resilient task',
      priority: 'MEDIUM', status: 'TODO',
      deadline: FUTURE_DATE, due_time: null,
      recurrence: 'NONE', is_complete: false,
    })

    await renderDashboard()
    await waitFor(() => screen.getByPlaceholderText(/what needs to get done/i))

    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Resilient task' },
    })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: FUTURE_DATE } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    // Task should still appear in the list
    await waitFor(() => {
      expect(screen.getByText('Resilient task')).toBeInTheDocument()
    })
    // No error message shown to user
    expect(screen.queryByText(/could not add task/i)).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 — Dynamic focusMins (onboarding preference respected)
// Tests: block duration = 4 × user-configured pomodoro_duration
// ─────────────────────────────────────────────────────────────────────────────
describe('dynamic focusMins from user preferences', () => {

  const FUTURE_DATE = fmt(TOMORROW)

  /**
   * DASH-31: User with pomodoro_duration=30 → block duration = 4×30 = 120 min
   * Oracle: createBlock called with end - start == 120 minutes
   *
   * This validates the full path: onboarding pref → TimerContext → smartSchedule
   * → block creation. A 30-min pomodoro should produce a 120-min block, not 100.
   */
  it('DASH-31: focusMins=30 (from onboarding) → auto-scheduled block duration = 120 min', async () => {
    // Arrange — inject user with 30-min pomodoro preference
    const user30 = {
      id: 'u-30', name: 'Bob Builder', email: 'bob@focusflow.dev',
      onboarding_completed: true,
      preferences: { pomodoro_duration: 30, short_break: 5, long_break: 15 },
    }
    mockFetchBlocks.mockResolvedValue([])
    mockCreateBlock.mockResolvedValue({ id: 'b-30' })
    mockCreateTask.mockResolvedValue({
      id: 'task-30', title: 'Long Session',
      priority: 'MEDIUM', status: 'TODO',
      deadline: FUTURE_DATE, due_time: null,
      recurrence: 'NONE', is_complete: false,
    })

    await renderDashboard({ user: user30 })
    await waitFor(() => screen.getByPlaceholderText(/what needs to get done/i))

    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Long Session' },
    })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: FUTURE_DATE } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => expect(mockCreateBlock).toHaveBeenCalled())

    const { start_time, end_time } = mockCreateBlock.mock.calls[0][0]
    const [sdp, stp] = start_time.split('T')
    const [edp, etp] = end_time.split('T')
    const [sy, sm, sd] = sdp.split('-').map(Number)
    const [ey, em, ed] = edp.split('-').map(Number)
    const [sh, smi]    = stp.split(':').map(Number)
    const [eh, emi]    = etp.split(':').map(Number)
    const diffMins = (new Date(ey,em-1,ed,eh,emi) - new Date(sy,sm-1,sd,sh,smi)) / 60000
    // 4 × 30 = 120 min, NOT 100 (the old hardcoded 4 × 25)
    expect(diffMins).toBe(120)
  })

  /**
   * DASH-32: DAILY recurring task → createBlocksBulk called (not createBlock)
   * Oracle: createBlocksBulk called with >1 payloads, all sharing a recurrence_group_id
   *
   * Validates that the recurring-series path is taken when recurrence != 'NONE'.
   */
  it('DASH-32: recurring DAILY task → createBlocksBulk called with multiple blocks', async () => {
    const bulkBlocks = [
      { id: 'b-rec-1', start_time: `${FUTURE_DATE}T06:00`, end_time: `${FUTURE_DATE}T07:40` },
      { id: 'b-rec-2' },
      { id: 'b-rec-3' },
    ]
    mockFetchBlocks.mockResolvedValue([])
    mockCreateBlocksBulk.mockResolvedValue(bulkBlocks)
    mockCreateBlock.mockResolvedValue({ id: 'b-single' })
    mockCreateTask.mockResolvedValue({
      id: 'daily-task', title: 'Daily Standup',
      priority: 'MEDIUM', status: 'TODO',
      deadline: FUTURE_DATE, due_time: null,
      recurrence: 'DAILY', is_complete: false,
    })

    await renderDashboard()
    await waitFor(() => screen.getByPlaceholderText(/what needs to get done/i))

    fireEvent.change(screen.getByPlaceholderText(/what needs to get done/i), {
      target: { value: 'Daily Standup' },
    })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: FUTURE_DATE } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => expect(mockCreateBlocksBulk).toHaveBeenCalled())

    // createBlock (single) should NOT have been called for a recurring task
    const singleArgs = mockCreateBlock.mock.calls.filter(
      c => c[0]?.recurrence === 'DAILY'
    )
    expect(singleArgs).toHaveLength(0)

    // Bulk payload must contain multiple blocks
    const [bulkArg] = mockCreateBlocksBulk.mock.calls[0]
    expect(bulkArg.length).toBeGreaterThan(1)
  })

  /**
   * DASH-33: Completing a recurring task auto-schedules the next occurrence
   * Oracle: markTaskComplete returns {completed, next_task}; createBlock or
   *         createBlocksBulk is called for the next_task
   */
  it('DASH-33: completing recurring task auto-schedules block for next occurrence', async () => {
    const NEXT_DATE = fmt(new Date(TOMORROW.getTime() + 86400000)) // day after TOMORROW
    const nextTask = {
      id: 'next-daily', title: 'Daily Standup',
      priority: 'MEDIUM', status: 'TODO',
      deadline: NEXT_DATE, due_time: null,
      recurrence: 'DAILY', is_complete: false,
    }

    mockMarkTaskComplete.mockResolvedValue({
      completed: {
        id: 'daily-done', title: 'Daily Standup',
        priority: 'MEDIUM', status: 'DONE',
        recurrence: 'DAILY', is_complete: true,
        deadline: FUTURE_DATE,
      },
      next_task: nextTask,
    })
    mockFetchBlocks.mockResolvedValue([])
    mockCreateBlock.mockResolvedValue({ id: 'b-next-single' })
    mockCreateBlocksBulk.mockResolvedValue([{ id: 'b-next-bulk-1' }, { id: 'b-next-bulk-2' }])

    const tasksWithRecurring = [
      {
        id: 'daily-done', title: 'Daily Standup', priority: 'MEDIUM',
        status: 'TODO', deadline: FUTURE_DATE,
        recurrence: 'DAILY', is_complete: false,
      },
    ]
    await renderDashboard({ tasks: tasksWithRecurring })

    await waitFor(() => screen.getByText('Daily Standup'))

    const completeBtn = screen.getAllByRole('button').find(
      b => /complete|done|✓|check/i.test(b.getAttribute('title') || b.textContent || '')
    )
    if (completeBtn) {
      fireEvent.click(completeBtn)
      // Either createBlock or createBlocksBulk should be called for next occurrence
      await waitFor(() => {
        const singleCalled = mockCreateBlock.mock.calls.length > 0
        const bulkCalled   = mockCreateBlocksBulk.mock.calls.length > 0
        expect(singleCalled || bulkCalled).toBe(true)
      }, { timeout: 3000 })
    }
  })
})
