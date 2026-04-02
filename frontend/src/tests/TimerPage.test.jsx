/**
 * @file TimerPage.test.jsx
 * @description Unit tests for the FocusFlow Pomodoro Timer page component
 *
 * Framework: Jest 29 + React Testing Library 16
 * Strategy:
 *   - jest.useFakeTimers() controls time without real waiting
 *   - TimerContext is provided via a real TimerProvider wrapper
 *   - logSession (API call) is mocked to prevent real HTTP calls
 *
 * Test Oracle Convention:
 *   Each test declares its Input, Expected Output, Success condition, Failure condition.
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TimerPage from '../pages/TimerPage'
import { TimerProvider } from '../context/TimerContext'
import { AuthProvider } from '../context/AuthContext'

// Mock ThemeContext — TimerPage uses useTheme() which needs ThemeProvider
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ dark: false, toggle: jest.fn() }),
}))

// Mock services that make real HTTP calls
jest.mock('../services/otherServices', () => ({
  logSession:    jest.fn().mockResolvedValue({}),
  fetchStats:    jest.fn().mockResolvedValue({ tasks_done: 0, deep_work_hours: 0 }),
  fetchSessions: jest.fn().mockResolvedValue([]),
}))

jest.mock('../services/taskService', () => ({
  fetchTasks: jest.fn().mockResolvedValue([
    { id: 't1', title: 'Design database schema', priority: 'HIGH', is_complete: false },
    { id: 't2', title: 'Write API docs', priority: 'MEDIUM', is_complete: false },
  ]),
}))

// Wrapper that provides all required contexts
function Wrapper({ children }) {
  return (
    <MemoryRouter>
      <AuthProvider>
        <TimerProvider>
          {children}
        </TimerProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

function renderTimer() {
  return render(<TimerPage />, { wrapper: Wrapper })
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
})

afterEach(() => {
  act(() => jest.runOnlyPendingTimers())
  jest.useRealTimers()
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Initial render
// ─────────────────────────────────────────────────────────────────────────────
describe('TimerPage — initial render', () => {

  /**
   * PT-01: Timer renders at 25:00 in IDLE state
   * Input:  Component mounted, no user interaction
   * Oracle: data-testid="timer-display" shows '25:00', 'Start Focus' button present
   * Success: Both elements found in DOM
   * Failure: Wrong initial time or missing button
   */
  test('PT-01: renders 25:00 display and Start Focus button on mount', () => {
    renderTimer()
    expect(screen.getByTestId('timer-display')).toHaveTextContent('25:00')
    expect(screen.getByRole('button', { name: /start focus/i })).toBeInTheDocument()
  })

  /**
   * PT-02: Phase label shows 'Ready' in IDLE state
   * Input:  Component mounted
   * Oracle: data-testid="phase-label" contains 'Ready'
   * Success: Text matches /ready/i
   * Failure: Wrong phase label shown
   */
  test('PT-02: shows Ready phase label before starting', () => {
    renderTimer()
    expect(screen.getByTestId('phase-label')).toHaveTextContent(/ready/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Timer countdown
// ─────────────────────────────────────────────────────────────────────────────
describe('TimerPage — countdown behaviour', () => {

  /**
   * PT-03: Timer counts down after clicking Start Focus
   * Input:  Click 'Start Focus', advance time by 1 second
   * Oracle: Timer display changes from '25:00' to '24:59'
   * Success: getByTestId('timer-display').textContent === '24:59'
   * Failure: Display unchanged or shows wrong value
   */
  test('PT-03: counts down to 24:59 after 1 second', async () => {
    renderTimer()

    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))

    act(() => { jest.advanceTimersByTime(1000) })

    expect(screen.getByTestId('timer-display')).toHaveTextContent('24:59')
  })

  /**
   * PT-04: Phase label switches to Focus when running
   * Input:  Click 'Start Focus'
   * Oracle: Phase label reads 'Focus'
   * Success: phase-label text matches /focus/i
   * Failure: Label still shows 'Ready'
   */
  test('PT-04: phase label becomes Focus after starting', () => {
    renderTimer()

    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))

    expect(screen.getByTestId('phase-label')).toHaveTextContent(/focus/i)
  })

  /**
   * PT-05: Timer counts down correctly after 5 seconds
   * Input:  Start timer, advance 5 seconds
   * Oracle: Timer display shows '24:55'
   * Success: Display === '24:55'
   * Failure: Wrong time shown
   */
  test('PT-05: shows 24:55 after 5 seconds', () => {
    renderTimer()

    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))
    act(() => { jest.advanceTimersByTime(5000) })

    expect(screen.getByTestId('timer-display')).toHaveTextContent('24:55')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Pause & Resume
// ─────────────────────────────────────────────────────────────────────────────
describe('TimerPage — pause and resume', () => {

  /**
   * PT-06: Timer pauses — display freezes
   * Input:  Start, advance 3s, click Pause, advance 3s more
   * Oracle: Display is the same before and after the second 3s advance
   * Success: Time frozen at pause point
   * Failure: Timer continues counting
   */
  test('PT-06: timer display freezes after clicking Pause', () => {
    renderTimer()

    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))
    act(() => { jest.advanceTimersByTime(3000) })

    const timeAtPause = screen.getByTestId('timer-display').textContent

    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    act(() => { jest.advanceTimersByTime(3000) })

    expect(screen.getByTestId('timer-display')).toHaveTextContent(timeAtPause)
  })

  /**
   * PT-07: Timer resumes after pause
   * Input:  Start, pause at 3s, resume, advance 1s more
   * Oracle: Timer display advances by 1 second after resume
   * Success: Display changes after resume advance
   * Failure: Display stays frozen
   */
  test('PT-07: timer resumes counting after clicking Resume', () => {
    renderTimer()

    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))
    act(() => { jest.advanceTimersByTime(3000) })

    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    const frozenTime = screen.getByTestId('timer-display').textContent

    fireEvent.click(screen.getByRole('button', { name: /resume/i }))
    act(() => { jest.advanceTimersByTime(1000) })

    expect(screen.getByTestId('timer-display').textContent).not.toBe(frozenTime)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Reset
// ─────────────────────────────────────────────────────────────────────────────
describe('TimerPage — reset', () => {

  /**
   * PT-08: Reset returns timer to 25:00
   * Input:  Start timer, advance 10s, click Reset
   * Oracle: Display shows '25:00', phase shows 'Ready'
   * Success: Both conditions met
   * Failure: Partial countdown shown or wrong phase
   */
  test('PT-08: reset returns display to 25:00 and phase to Ready', () => {
    renderTimer()

    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))
    act(() => { jest.advanceTimersByTime(10000) })

    fireEvent.click(screen.getByRole('button', { name: /reset/i }))

    expect(screen.getByTestId('timer-display')).toHaveTextContent('25:00')
    expect(screen.getByTestId('phase-label')).toHaveTextContent(/ready/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: Phase transition
// ─────────────────────────────────────────────────────────────────────────────
describe('TimerPage — phase transitions', () => {

  /**
   * PT-09: Phase switches to Short Break after full 25-minute session
   * Input:  Start timer, advance full 25 minutes (1500 seconds)
   * Oracle: Phase label contains 'break' (case-insensitive)
   * Success: /break/i matches the phase label
   * Failure: Phase still shows Focus or Ready
   */
  test('PT-09: phase label switches to Short Break after 25 minutes', async () => {
    renderTimer()
    fireEvent.click(screen.getByRole('button', { name: /start focus/i }))
    await act(async () => {
      jest.advanceTimersByTime(25 * 60 * 1000)
    })
    expect(screen.getByTestId('phase-label').textContent).toMatch(/break/i)
  })
})
