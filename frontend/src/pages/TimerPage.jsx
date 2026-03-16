/**
 * TimerPage
 *
 * Full Pomodoro timer UI. Uses the global TimerContext so the countdown
 * persists even when the user navigates to other pages.
 */

import React, { useEffect, useState } from 'react'
import { useTimer, PHASES } from '../context/TimerContext'
import { fetchTasks } from '../services/taskService'

const PHASE_LABELS = {
  [PHASES.IDLE]:        { label: 'Ready',        color: 'text-gray-400',  ring: 'stroke-gray-200' },
  [PHASES.FOCUS]:       { label: 'Focus',         color: 'text-indigo-600', ring: 'stroke-indigo-500' },
  [PHASES.SHORT_BREAK]: { label: 'Short Break',   color: 'text-green-600',  ring: 'stroke-green-400' },
  [PHASES.LONG_BREAK]:  { label: 'Long Break',    color: 'text-blue-600',   ring: 'stroke-blue-400' },
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
    fetchTasks().then(t => setTasks(t.filter(tk => !tk.is_complete)))
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

  // SVG ring progress
  const radius = 88
  const circumference = 2 * Math.PI * radius
  const totalSecs = phase === PHASES.SHORT_BREAK ? 5 * 60
                  : phase === PHASES.LONG_BREAK  ? 15 * 60
                  : WORK_SECS
  const progress = secondsLeft / totalSecs
  const strokeDash = circumference * progress

  const { label, color, ring } = PHASE_LABELS[phase]

  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      <h1 className="text-xl font-bold text-gray-800 mb-8">Pomodoro Timer</h1>

      {/* Task selector */}
      <div className="mb-8">
        <label className="block text-xs text-gray-500 mb-2">Working on</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={activeTaskId || ''}
          onChange={e => setActiveTaskId(e.target.value || null)}
          disabled={phase !== PHASES.IDLE}
        >
          <option value="">— No task selected —</option>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      {/* SVG circular timer */}
      <div className="flex justify-center mb-8">
        <div className="relative w-52 h-52">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            {/* Background ring */}
            <circle cx="100" cy="100" r={radius} fill="none"
              stroke="#E5E7EB" strokeWidth="10" />
            {/* Progress ring */}
            <circle cx="100" cy="100" r={radius} fill="none"
              className={ring}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${strokeDash} ${circumference}`}
              style={{ transition: 'stroke-dasharray 1s linear' }}
            />
          </svg>
          {/* Timer display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              data-testid="timer-display"
              className={`text-4xl font-mono font-bold ${color}`}
            >
              {display}
            </span>
            <span
              data-testid="phase-label"
              className={`text-xs mt-1 font-medium ${color}`}
            >
              {label}
            </span>
          </div>
        </div>
      </div>

      {/* Cycle counter */}
      <div className="flex justify-center gap-2 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i < (cycleCount % 4) ? 'bg-indigo-500' : 'bg-gray-200'
            }`}
          />
        ))}
        <span className="text-xs text-gray-400 ml-2">cycle {cycleCount}</span>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4">
        {phase === PHASES.IDLE ? (
          <button
            onClick={handleStart}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            Start Focus
          </button>
        ) : (
          <>
            {running ? (
              <button
                onClick={handlePause}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-xl text-sm"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={handleResume}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl text-sm"
              >
                Resume
              </button>
            )}
            <button
              onClick={handleReset}
              className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold px-6 py-3 rounded-xl text-sm"
            >
              Reset
            </button>
          </>
        )}
      </div>
    </div>
  )
}
