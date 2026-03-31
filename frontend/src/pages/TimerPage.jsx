/**
 * TimerPage — Pomodoro focus timer with editorial aesthetic.
 *
 * Large circular countdown, bold buttons, cycle dots.
 */

import React, { useEffect, useState } from 'react'
import { useTimer, PHASES } from '../context/TimerContext'
import { fetchTasks } from '../services/taskService'

const PHASE_RING = {
  [PHASES.IDLE]:        'stroke-gray-900',
  [PHASES.FOCUS]:       'stroke-gray-900',
  [PHASES.SHORT_BREAK]: 'stroke-emerald-500',
  [PHASES.LONG_BREAK]:  'stroke-sky-500',
}

const PHASE_LABEL = {
  [PHASES.IDLE]:        'Ready',
  [PHASES.FOCUS]:       'Focus',
  [PHASES.SHORT_BREAK]: 'Short Break',
  [PHASES.LONG_BREAK]:  'Long Break',
}

const WORK_SECS = 25 * 60

export default function TimerPage() {
  const {
    phase, secondsLeft, cycleCount, display,
    startFocus, pause, resume, reset,
    activeTaskId, setActiveTaskId,
  } = useTimer()

  const [tasks, setTasks]     = useState([])
  const [running, setRunning] = useState(false)

  useEffect(() => {
    fetchTasks().then(t => setTasks(t.filter(tk => !tk.is_complete))).catch(() => {})
  }, [])

  function handleStart() {
    startFocus(activeTaskId || null)
    setRunning(true)
  }

  function handlePause() {
    pause()
    setRunning(false)
  }

  function handleResume() {
    resume()
    setRunning(true)
  }

  function handleReset() {
    reset()
    setRunning(false)
  }

  // SVG ring
  const radius = 120
  const circumference = 2 * Math.PI * radius
  const totalSecs = phase === PHASES.SHORT_BREAK ? 5 * 60
                  : phase === PHASES.LONG_BREAK  ? 15 * 60
                  : WORK_SECS
  const progress = secondsLeft / totalSecs
  const strokeDash = circumference * progress

  const ringColor = PHASE_RING[phase]
  const phaseLabel = PHASE_LABEL[phase]

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-8 -mt-12">

      {/* Task selector */}
      <div className="mb-10 w-full max-w-xs">
        <select
          className="w-full border-2 border-gray-900 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900
                     bg-white focus:outline-none focus:ring-0 appearance-none cursor-pointer"
          value={activeTaskId || ''}
          onChange={e => setActiveTaskId(e.target.value || null)}
          disabled={phase !== PHASES.IDLE}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23111827' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
        >
          <option value="">Select a task...</option>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      {/* Circular timer */}
      <div className="relative w-72 h-72 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
          {/* Background ring */}
          <circle cx="130" cy="130" r={radius} fill="none"
            stroke="#E5E7EB" strokeWidth="6" />
          {/* Progress ring */}
          <circle cx="130" cy="130" r={radius} fill="none"
            className={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        {/* Timer display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-testid="timer-display"
            className="text-6xl font-extrabold font-mono text-gray-900 tracking-tight"
          >
            {display}
          </span>
          <span
            data-testid="phase-label"
            className="text-sm font-bold text-gray-400 mt-2 uppercase tracking-widest"
          >
            {phaseLabel}
          </span>
        </div>
      </div>

      {/* Cycle dots */}
      <div className="flex items-center gap-3 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-2 transition-colors ${
              i < (cycleCount % 4)
                ? 'bg-gray-900 border-gray-900'
                : 'bg-transparent border-gray-300'
            }`}
          />
        ))}
        <span className="text-xs font-bold text-gray-400 ml-1 uppercase tracking-widest">
          Cycle {cycleCount}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {phase === PHASES.IDLE ? (
          <button
            onClick={handleStart}
            className="bg-gray-900 text-white font-extrabold text-sm px-8 py-3.5 rounded-lg
                       border-2 border-gray-900 hover:bg-gray-800 transition-colors"
          >
            Start Focus
          </button>
        ) : (
          <>
            {running ? (
              <button
                onClick={handlePause}
                className="bg-gray-900 text-white font-extrabold text-sm px-8 py-3.5 rounded-lg
                           border-2 border-gray-900 hover:bg-gray-800 transition-colors"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={handleResume}
                className="bg-gray-900 text-white font-extrabold text-sm px-8 py-3.5 rounded-lg
                           border-2 border-gray-900 hover:bg-gray-800 transition-colors"
              >
                Resume
              </button>
            )}
            <button
              onClick={handleReset}
              className="flex items-center gap-2 border-2 border-gray-900 text-gray-900 font-extrabold text-sm
                         px-6 py-3.5 rounded-lg hover:bg-gray-900 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </button>
          </>
        )}
      </div>
    </div>
  )
}
