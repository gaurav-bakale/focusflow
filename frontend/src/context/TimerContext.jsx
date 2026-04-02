// ── Design Patterns ──────────────────────────────────────────────────────────
// Observer     — TimerContext implements the Observer pattern: components
//                subscribe via useTimer() and re-render when state changes.
// State Machine — phase transitions (IDLE→FOCUS→SHORT_BREAK→LONG_BREAK→IDLE)
//                 follow a finite state machine; only valid transitions allowed.
// Command      — startFocus, pause, resume, reset, skipPhase are command objects
//                that encapsulate timer operations with undo-safe semantics.
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { logSession } from '../services/otherServices'
import { PHASES } from './timerPhases'
import { useAuth } from './AuthContext'

const CYCLES_BEFORE_LONG = 4

const TimerContext = createContext(null)

export function TimerProvider({ children }) {
  const { user } = useAuth()

  // Seed durations from user's onboarding preferences (fallback to defaults)
  const prefFocus = user?.preferences?.pomodoro_duration ?? 25
  const prefShort = user?.preferences?.short_break ?? 5
  const prefLong  = user?.preferences?.long_break  ?? 15

  const [focusMins, setFocusMins]   = useState(prefFocus)
  const [shortMins, setShortMins]   = useState(prefShort)
  const [longMins,  setLongMins]    = useState(prefLong)

  const [phase,       setPhase]       = useState(PHASES.IDLE)
  const [secondsLeft, setSecondsLeft] = useState(prefFocus * 60)
  const [cycleCount,  setCycleCount]  = useState(0)
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [isRunning,   setIsRunning]   = useState(false)

  const intervalRef = useRef(null)
  const phaseRef    = useRef(PHASES.IDLE)
  const cycleRef    = useRef(0)
  const focusRef    = useRef(25)
  const shortRef    = useRef(5)
  const longRef     = useRef(15)
  const taskRef     = useRef(null)

  useEffect(() => { phaseRef.current  = phase },       [phase])
  useEffect(() => { cycleRef.current  = cycleCount },  [cycleCount])
  useEffect(() => { focusRef.current  = focusMins },   [focusMins])
  useEffect(() => { shortRef.current  = shortMins },   [shortMins])
  useEffect(() => { longRef.current   = longMins },    [longMins])
  useEffect(() => { taskRef.current   = activeTaskId },[activeTaskId])

  // When user loads async (token rehydration), apply their preferences
  // Only update if the timer hasn't started yet
  useEffect(() => {
    if (!user?.preferences) return
    const { pomodoro_duration: f = 25, short_break: s = 5, long_break: l = 15 } = user.preferences
    setFocusMins(f)
    setShortMins(s)
    setLongMins(l)
    setSecondsLeft(prev => {
      // Only reset the clock if timer is idle (not mid-session)
      if (phaseRef.current === PHASES.IDLE) return f * 60
      return prev
    })
  }, [user?.id])

  // Keep page title in sync
  useEffect(() => {
    if (phase === PHASES.IDLE) {
      document.title = 'FocusFlow'
    } else {
      const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
      const s = String(secondsLeft % 60).padStart(2, '0')
      const label = phase === PHASES.FOCUS ? '🎯' : phase === PHASES.SHORT_BREAK ? '☕' : '🌿'
      document.title = `${label} ${m}:${s} — FocusFlow`
    }
  }, [secondsLeft, phase])

  function format(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, '0')
    const s = String(secs % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  function clearTick() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function startTick() {
    clearTick()
    intervalRef.current = setInterval(tick, 1000)
  }

  async function handlePhaseEnd() {
    clearTick()
    if (phaseRef.current === PHASES.FOCUS) {
      try {
        await logSession({
          task_id: taskRef.current,
          phase: 'FOCUS',
          duration_minutes: focusRef.current,
        })
      } catch (_) { /* non-blocking */ }

      const newCount = cycleRef.current + 1
      setCycleCount(newCount)
      cycleRef.current = newCount

      const isLong = newCount % CYCLES_BEFORE_LONG === 0
      const breakSecs = isLong ? longRef.current * 60 : shortRef.current * 60
      const breakPhase = isLong ? PHASES.LONG_BREAK : PHASES.SHORT_BREAK

      setPhase(breakPhase)
      phaseRef.current = breakPhase
      setSecondsLeft(breakSecs)
      // Auto-start the break
      intervalRef.current = setInterval(tick, 1000)
      setIsRunning(true)
    } else {
      // Break ended — go back to focus, wait for user to start
      setPhase(PHASES.FOCUS)
      phaseRef.current = PHASES.FOCUS
      setSecondsLeft(focusRef.current * 60)
      setIsRunning(false)
    }
  }

  const tick = useCallback(() => {
    setSecondsLeft(prev => {
      if (prev <= 1) {
        handlePhaseEnd()
        return 0
      }
      return prev - 1
    })
  }, [])

  function startFocus(taskId = null) {
    setActiveTaskId(taskId)
    taskRef.current = taskId
    setPhase(PHASES.FOCUS)
    phaseRef.current = PHASES.FOCUS
    setSecondsLeft(focusRef.current * 60)
    setIsRunning(true)
    startTick()
  }

  function pause() {
    clearTick()
    setIsRunning(false)
  }

  function resume() {
    startTick()
    setIsRunning(true)
  }

  function reset() {
    clearTick()
    setPhase(PHASES.IDLE)
    phaseRef.current = PHASES.IDLE
    setSecondsLeft(focusRef.current * 60)
    setCycleCount(0)
    cycleRef.current = 0
    setActiveTaskId(null)
    taskRef.current = null
    setIsRunning(false)
    document.title = 'FocusFlow'
  }

  // Select a phase without starting (used by phase tabs)
  function selectPhase(targetPhase) {
    if (isRunning) return
    clearTick()
    setIsRunning(false)
    const secs = targetPhase === PHASES.FOCUS       ? focusRef.current * 60
               : targetPhase === PHASES.SHORT_BREAK ? shortRef.current * 60
               : longRef.current * 60
    setPhase(targetPhase)
    phaseRef.current = targetPhase
    setSecondsLeft(secs)
    if (targetPhase === PHASES.FOCUS) {
      setCycleCount(0)
      cycleRef.current = 0
      setActiveTaskId(null)
      taskRef.current = null
      document.title = 'FocusFlow'
    }
  }

  // Start a break phase immediately (used when user taps "Start Break")
  function startBreak(breakPhase) {
    const secs = breakPhase === PHASES.LONG_BREAK ? longRef.current * 60 : shortRef.current * 60
    setPhase(breakPhase)
    phaseRef.current = breakPhase
    setSecondsLeft(secs)
    setIsRunning(true)
    startTick()
  }

  // Skip to next phase manually
  function skipPhase() {
    clearTick()
    if (phaseRef.current === PHASES.FOCUS) {
      const newCount = cycleRef.current + 1
      setCycleCount(newCount)
      cycleRef.current = newCount
      const isLong = newCount % CYCLES_BEFORE_LONG === 0
      const breakPhase = isLong ? PHASES.LONG_BREAK : PHASES.SHORT_BREAK
      const breakSecs  = isLong ? longRef.current * 60 : shortRef.current * 60
      setPhase(breakPhase)
      phaseRef.current = breakPhase
      setSecondsLeft(breakSecs)
      setIsRunning(false)
    } else {
      setPhase(PHASES.FOCUS)
      phaseRef.current = PHASES.FOCUS
      setSecondsLeft(focusRef.current * 60)
      setIsRunning(false)
    }
  }

  useEffect(() => () => clearTick(), [])

  return (
    <TimerContext.Provider value={{
      phase, secondsLeft, cycleCount, activeTaskId, isRunning,
      focusMins, shortMins, longMins,
      display: format(secondsLeft),
      startFocus, startBreak, pause, resume, reset, skipPhase, selectPhase,
      setActiveTaskId, setFocusMins, setShortMins, setLongMins,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  return useContext(TimerContext)
}
