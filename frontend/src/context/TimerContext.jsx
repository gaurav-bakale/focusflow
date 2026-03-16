import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { logSession } from '../services/otherServices'

const WORK_DURATION = 25 * 60
const SHORT_BREAK   = 5  * 60
const LONG_BREAK    = 15 * 60
const CYCLES_BEFORE_LONG = 4

export const PHASES = {
  IDLE:        'IDLE',
  FOCUS:       'FOCUS',
  SHORT_BREAK: 'SHORT_BREAK',
  LONG_BREAK:  'LONG_BREAK',
}

const TimerContext = createContext(null)

export function TimerProvider({ children }) {
  const [phase, setPhase]             = useState(PHASES.IDLE)
  const [secondsLeft, setSecondsLeft] = useState(WORK_DURATION)
  const [cycleCount, setCycleCount]   = useState(0)
  const [activeTaskId, setActiveTaskId] = useState(null)
  const intervalRef = useRef(null)
  const phaseRef    = useRef(PHASES.IDLE)
  const cycleRef    = useRef(0)

  useEffect(() => { phaseRef.current = phase },      [phase])
  useEffect(() => { cycleRef.current = cycleCount }, [cycleCount])

  function format(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, '0')
    const s = String(secs % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  async function handlePhaseEnd() {
    if (phaseRef.current === PHASES.FOCUS) {
      try {
        await logSession({ task_id: activeTaskId, phase: 'FOCUS', duration_minutes: 25 })
      } catch (_) { /* non-blocking */ }

      const newCount = cycleRef.current + 1
      setCycleCount(newCount)
      cycleRef.current = newCount

      if (newCount % CYCLES_BEFORE_LONG === 0) {
        setPhase(PHASES.LONG_BREAK)
        setSecondsLeft(LONG_BREAK)
      } else {
        setPhase(PHASES.SHORT_BREAK)
        setSecondsLeft(SHORT_BREAK)
      }
    } else {
      setPhase(PHASES.FOCUS)
      setSecondsLeft(WORK_DURATION)
    }
  }

  const tick = useCallback(() => {
    setSecondsLeft(prev => {
      if (prev <= 1) {
        clearInterval(intervalRef.current)
        handlePhaseEnd()
        return 0
      }
      return prev - 1
    })
  }, [])

  function startFocus(taskId = null) {
    setActiveTaskId(taskId)
    setPhase(PHASES.FOCUS)
    phaseRef.current = PHASES.FOCUS
    setSecondsLeft(WORK_DURATION)
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(tick, 1000)
  }

  function pause() {
    clearInterval(intervalRef.current)
  }

  function resume() {
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(tick, 1000)
  }

  function reset() {
    clearInterval(intervalRef.current)
    setPhase(PHASES.IDLE)
    phaseRef.current = PHASES.IDLE
    setSecondsLeft(WORK_DURATION)
    setCycleCount(0)
    cycleRef.current = 0
    setActiveTaskId(null)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const isRunning = phase !== PHASES.IDLE && intervalRef.current !== null

  return (
    <TimerContext.Provider value={{
      phase, secondsLeft, cycleCount, activeTaskId,
      display: format(secondsLeft),
      isRunning,
      startFocus, pause, resume, reset,
      setActiveTaskId,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  return useContext(TimerContext)
}