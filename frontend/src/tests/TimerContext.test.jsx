/**
 * @file TimerContext.test.jsx
 * @description Unit tests for TimerContext — the global Pomodoro timer state.
 * Framework: Jest 29 + @testing-library/react
 *
 * Key feature under test:
 *   TimerContext reads `user.preferences` from AuthContext (via useAuth()) to seed
 *   the initial focusMins / shortMins / longMins values.
 *   It also re-syncs when `user.id` changes (different user logs in).
 *
 * Coverage:
 *   TIMER-CTX-01: No user (null) → defaults to 25 / 5 / 15
 *   TIMER-CTX-02: User with full preferences → timer uses 30 / 8 / 20
 *   TIMER-CTX-03: User with partial preferences → provided values used, defaults fill gaps
 *   TIMER-CTX-04: User changes (different user.id) → preferences update to new user's values
 *   TIMER-CTX-05: IDLE phase secondsLeft equals focusMins * 60
 */

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { TimerProvider, useTimer } from '../context/TimerContext'
import { PHASES } from '../context/timerPhases'

// ── Mock AuthContext ──────────────────────────────────────────────────────────
// We control the user object returned by useAuth() so tests are fully isolated.
let mockUser = null

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))

// ── Mock otherServices ────────────────────────────────────────────────────────
// logSession is called when a focus phase ends; we never want real HTTP calls.
jest.mock('../services/otherServices', () => ({
  logSession: jest.fn().mockResolvedValue(undefined),
}))

// ── Wrapper ───────────────────────────────────────────────────────────────────
const wrapper = ({ children }) => <TimerProvider>{children}</TimerProvider>

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Build a user object with the given preference overrides. */
function makeUser(id, prefs = {}) {
  return {
    id,
    name: 'Test User',
    email: 'test@focusflow.dev',
    preferences: prefs,
  }
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeEach(() => {
  mockUser = null
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

// ─────────────────────────────────────────────────────────────────────────────
// TIMER-CTX-01
// ─────────────────────────────────────────────────────────────────────────────
describe('TIMER-CTX-01: no user (not logged in)', () => {
  /**
   * When useAuth() returns { user: null }, TimerContext must fall back to the
   * hard-coded defaults: focusMins=25, shortMins=5, longMins=15.
   */
  test('defaults to 25 / 5 / 15 when user is null', () => {
    mockUser = null

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.focusMins).toBe(25)
    expect(result.current.shortMins).toBe(5)
    expect(result.current.longMins).toBe(15)
  })

  test('phase is IDLE when no user', () => {
    mockUser = null

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.phase).toBe(PHASES.IDLE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TIMER-CTX-02
// ─────────────────────────────────────────────────────────────────────────────
describe('TIMER-CTX-02: user with full preferences', () => {
  /**
   * When a user with complete preferences is present at mount time, all three
   * durations must be seeded from user.preferences.
   */
  test('timer uses 30 / 8 / 20 from user preferences', () => {
    mockUser = makeUser('u1', {
      pomodoro_duration: 30,
      short_break: 8,
      long_break: 20,
    })

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.focusMins).toBe(30)
    expect(result.current.shortMins).toBe(8)
    expect(result.current.longMins).toBe(20)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TIMER-CTX-03
// ─────────────────────────────────────────────────────────────────────────────
describe('TIMER-CTX-03: user with partial preferences', () => {
  /**
   * When only some preference keys are present, the provided values take effect
   * while missing keys fall back to defaults (25 / 5 / 15).
   * This exercises the `?? default` null-coalescing guards in TimerContext.
   */
  test('uses provided pomodoro_duration, falls back to defaults for missing keys', () => {
    // Only pomodoro_duration is set; short_break and long_break are absent
    mockUser = makeUser('u2', { pomodoro_duration: 45 })

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.focusMins).toBe(45)
    expect(result.current.shortMins).toBe(5)   // default
    expect(result.current.longMins).toBe(15)   // default
  })

  test('uses provided short_break and long_break, falls back for missing pomodoro_duration', () => {
    mockUser = makeUser('u3', { short_break: 10, long_break: 25 })

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.focusMins).toBe(25)  // default
    expect(result.current.shortMins).toBe(10)
    expect(result.current.longMins).toBe(25)
  })

  test('user with empty preferences object uses all defaults', () => {
    mockUser = makeUser('u4', {})

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.focusMins).toBe(25)
    expect(result.current.shortMins).toBe(5)
    expect(result.current.longMins).toBe(15)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TIMER-CTX-04
// ─────────────────────────────────────────────────────────────────────────────
describe('TIMER-CTX-04: user changes (different user.id)', () => {
  /**
   * TimerContext runs a useEffect keyed on user?.id. When a different user
   * logs in (different id + different preferences), the timer durations must
   * update to reflect the new user's settings.
   *
   * We simulate this by re-rendering with a new mockUser value.
   */
  test('preferences update when a different user logs in', async () => {
    // First user: 30-minute focus sessions
    mockUser = makeUser('u-alice', { pomodoro_duration: 30, short_break: 7, long_break: 18 })

    const { result, rerender } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.focusMins).toBe(30)

    // Second user logs in with different preferences
    mockUser = makeUser('u-bob', { pomodoro_duration: 50, short_break: 10, long_break: 30 })

    await act(async () => {
      rerender()
    })

    await waitFor(() => {
      expect(result.current.focusMins).toBe(50)
    })

    expect(result.current.shortMins).toBe(10)
    expect(result.current.longMins).toBe(30)
  })

  test('secondsLeft resets to new focusMins * 60 when idle and user changes', async () => {
    mockUser = makeUser('u-alice', { pomodoro_duration: 30 })

    const { result, rerender } = renderHook(() => useTimer(), { wrapper })

    // In IDLE phase, secondsLeft should track focusMins * 60
    expect(result.current.secondsLeft).toBe(30 * 60)

    // A new user with a different focus duration
    mockUser = makeUser('u-carol', { pomodoro_duration: 20 })

    await act(async () => {
      rerender()
    })

    await waitFor(() => {
      expect(result.current.secondsLeft).toBe(20 * 60)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TIMER-CTX-05
// ─────────────────────────────────────────────────────────────────────────────
describe('TIMER-CTX-05: IDLE phase secondsLeft equals focusMins * 60', () => {
  /**
   * In the IDLE phase, the countdown display must be initialised to
   * focusMins * 60 seconds — regardless of where focusMins came from
   * (default or user preference).
   */
  test('secondsLeft is 25*60=1500 with no user (defaults)', () => {
    mockUser = null

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.phase).toBe(PHASES.IDLE)
    expect(result.current.secondsLeft).toBe(25 * 60)
  })

  test('secondsLeft is focusMins*60 when user has pomodoro_duration=40', () => {
    mockUser = makeUser('u5', { pomodoro_duration: 40 })

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.phase).toBe(PHASES.IDLE)
    expect(result.current.secondsLeft).toBe(40 * 60)
  })

  test('display matches MM:SS format derived from secondsLeft', () => {
    mockUser = makeUser('u6', { pomodoro_duration: 25 })

    const { result } = renderHook(() => useTimer(), { wrapper })

    // 25 * 60 = 1500 seconds → "25:00"
    expect(result.current.display).toBe('25:00')
  })

  test('timer is not running in IDLE phase', () => {
    mockUser = null

    const { result } = renderHook(() => useTimer(), { wrapper })

    expect(result.current.isRunning).toBe(false)
    expect(result.current.cycleCount).toBe(0)
  })
})
