/**
 * TimerPage — Modern Pomodoro focus timer.
 *
 * Layout:
 *   Left  — Phase tabs, animated ring, cycle dots, controls
 *   Right — Task picker, duration settings, today's session log
 *
 * Features:
 *   • Customisable focus / short-break / long-break durations
 *   • Fancy task picker with priority + status badges
 *   • Auto-starts break after focus ends
 *   • Skip to next phase button
 *   • Live page title update (🎯 24:59 — FocusFlow)
 *   • Today's session log with total focus time
 *   • Daily stats: sessions done, minutes focused, cycles complete
 */

import React, { useEffect, useState, useRef } from 'react'
import { useTimer } from '../context/TimerContext'
import { PHASES } from '../context/timerPhases'
import { fetchTasks, updateTask } from '../services/taskService'
import { fetchSessions } from '../services/otherServices'

// ── Phase config ──────────────────────────────────────────────────────────────
// Strategy pattern — PHASE_CONFIG maps each phase to a strategy object
// (color, label, ring color) consumed uniformly by the UI. Switching
// phases swaps the active strategy without if/else chains.
const PHASE_CONFIG = {
  [PHASES.IDLE]:        { label: 'Ready',       color: '#1e293b', ring: '#1e293b', bg: 'bg-slate-50',    tab: 'Focus'       },
  [PHASES.FOCUS]:       { label: 'Focus',        color: '#6366f1', ring: '#6366f1', bg: 'bg-indigo-50',   tab: 'Focus'       },
  [PHASES.SHORT_BREAK]: { label: 'Short Break',  color: '#10b981', ring: '#10b981', bg: 'bg-emerald-50',  tab: 'Short Break' },
  [PHASES.LONG_BREAK]:  { label: 'Long Break',   color: '#0ea5e9', ring: '#0ea5e9', bg: 'bg-sky-50',      tab: 'Long Break'  },
}

const PRIORITY_DOT = { HIGH: 'bg-red-400', MEDIUM: 'bg-amber-400', LOW: 'bg-gray-300' }
const STATUS_LABEL  = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' }
const STATUS_COLOR  = { TODO: 'text-slate-500', IN_PROGRESS: 'text-blue-600', DONE: 'text-emerald-600' }

// ── Duration input (clamp on blur) ────────────────────────────────────────────
function DurationInput({ label, value, onChange, min = 1, max = 90, disabled }) {
  const [local, setLocal] = useState(String(value))
  useEffect(() => setLocal(String(value)), [value])

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => !disabled && onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center
                     text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
        >−</button>
        <input
          type="number"
          value={local}
          disabled={disabled}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            const n = Math.min(max, Math.max(min, parseInt(local) || min))
            setLocal(String(n))
            onChange(n)
          }}
          className="w-10 text-center text-sm font-bold border border-gray-200 rounded-lg py-0.5
                     focus:outline-none focus:border-gray-900 transition-colors disabled:opacity-40"
        />
        <span className="text-xs text-gray-400 font-medium">min</span>
        <button
          onClick={() => !disabled && onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center
                     text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
        >+</button>
      </div>
    </div>
  )
}

// ── Task picker dropdown ───────────────────────────────────────────────────────
function TaskPicker({ tasks, selectedId, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = tasks.find(t => t.id === selectedId)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-3 border-2 rounded-xl text-left
                    transition-colors ${disabled ? 'opacity-50 cursor-not-allowed border-gray-200' :
                    'border-gray-200 hover:border-gray-900 cursor-pointer'}
                    ${open ? 'border-gray-900' : ''}`}
      >
        {selected ? (
          <>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[selected.priority] || 'bg-gray-300'}`} />
            <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{selected.title}</span>
            {selected.estimated_minutes && (
              <span className="text-xs font-bold text-indigo-500 shrink-0">
                🍅 {Math.ceil(selected.estimated_minutes / 25)}
              </span>
            )}
            {selected.recurrence && selected.recurrence !== 'NONE' && (
              <span className="text-xs text-indigo-400 shrink-0">↻</span>
            )}
          </>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
            <span className="flex-1 text-sm font-medium text-gray-400">Focus without a task…</span>
          </>
        )}
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border-2 border-gray-900
                        rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
          {/* No task option */}
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
              !selectedId ? 'bg-gray-50' : ''
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
            <span className="text-sm text-gray-400 font-medium">No task — free focus</span>
          </button>
          <div className="h-px bg-gray-100" />
          {tasks.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">No active tasks</div>
          ) : (
            tasks.map(t => (
              <button
                key={t.id}
                onClick={() => { onSelect(t.id); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                  t.id === selectedId ? 'bg-indigo-50' : ''
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`} />
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{t.title}</span>
                {t.recurrence && t.recurrence !== 'NONE' && (
                  <span className="text-xs text-indigo-400 shrink-0">↻</span>
                )}
                {t.estimated_minutes ? (
                  <span className="text-xs font-bold text-indigo-500 shrink-0">
                    🍅 {Math.ceil(t.estimated_minutes / 25)}
                  </span>
                ) : (
                  <span className={`text-xs font-bold shrink-0 ${STATUS_COLOR[t.status] || ''}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TimerPage() {
  const {
    phase, secondsLeft, cycleCount, activeTaskId, isRunning,
    focusMins, shortMins, longMins,
    display, startFocus, startBreak, pause, resume, reset, skipPhase, selectPhase,
    setActiveTaskId, setFocusMins, setShortMins, setLongMins,
  } = useTimer()

  const [tasks,    setTasks]    = useState([])
  const [sessions, setSessions] = useState([])
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    fetchTasks().then(ts => setTasks(ts.filter(t => !t.is_complete))).catch(() => {})
    fetchSessions().then(ss => {
      const todayStr = new Date().toISOString().split('T')[0]
      setSessions(ss.filter(s => s.completed_at?.startsWith(todayStr)).reverse())
    }).catch(() => {})
  }, [])

  // Refresh sessions after a focus phase ends
  useEffect(() => {
    if (phase === PHASES.SHORT_BREAK || phase === PHASES.LONG_BREAK) {
      const todayStr = new Date().toISOString().split('T')[0]
      fetchSessions().then(ss => {
        setSessions(ss.filter(s => s.completed_at?.startsWith(todayStr)).reverse())
      }).catch(() => {})
    }
  }, [phase])

  const cfg         = PHASE_CONFIG[phase]
  const isIdle      = phase === PHASES.IDLE
  const isFocus     = phase === PHASES.FOCUS
  const isBreak     = phase === PHASES.SHORT_BREAK || phase === PHASES.LONG_BREAK
  const activeTask  = tasks.find(t => t.id === activeTaskId)

  // SVG ring
  const R    = 130
  const CIRC = 2 * Math.PI * R
  const totalSecs = (isIdle || isFocus) ? focusMins * 60
                  : phase === PHASES.SHORT_BREAK ? shortMins * 60
                  : longMins * 60
  const progress  = totalSecs > 0 ? secondsLeft / totalSecs : 1
  const dash      = CIRC * progress

  // Today's stats
  const totalFocusMins  = sessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  const sessionsToday   = sessions.length
  const cyclesComplete  = Math.floor(cycleCount / 4)

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* ── Stats strip ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Sessions Today', value: sessionsToday,   unit: '',    accent: '#6366f1' },
            { label: 'Focus Time',     value: totalFocusMins,  unit: 'min', accent: '#10b981' },
            { label: 'Full Cycles',    value: cyclesComplete,  unit: '',    accent: '#f59e0b' },
          ].map(({ label, value, unit, accent }) => (
            <div key={label} className="bg-white border-2 border-gray-900 rounded-xl px-5 py-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: accent }} />
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
              <p className="text-3xl font-extrabold font-mono" style={{ color: accent }}>
                {value}<span className="text-base font-bold text-gray-400 ml-1">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-6">

          {/* ── Left: timer ──────────────────────────────────────────────────── */}
          <div className="col-span-3 bg-white border-2 border-gray-900 rounded-2xl p-8 flex flex-col items-center">

            {/* Phase tabs */}
            <div className="flex bg-gray-100 rounded-xl p-1 mb-8 w-full max-w-sm">
              {[
                { p: PHASES.FOCUS,       label: 'Focus',       color: '#6366f1' },
                { p: PHASES.SHORT_BREAK, label: 'Short Break', color: '#10b981' },
                { p: PHASES.LONG_BREAK,  label: 'Long Break',  color: '#0ea5e9' },
              ].map(({ p, label, color }) => {
                const isActive = phase === p || (isIdle && p === PHASES.FOCUS)
                return (
                  <button
                    key={p}
                    disabled={isRunning}
                    onClick={() => selectPhase(p)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
                      ${isRunning ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                      ${isActive ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    style={isActive ? { color } : {}}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Ring timer */}
            <div className="relative mb-6" style={{ width: 300, height: 300 }}>
              <svg width="300" height="300" className="-rotate-90" viewBox="0 0 300 300">
                {/* Track */}
                <circle cx="150" cy="150" r={R} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                {/* Progress */}
                <circle
                  cx="150" cy="150" r={R}
                  fill="none"
                  stroke={cfg.color}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${CIRC}`}
                  style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s ease' }}
                />
                {/* Glow effect — faint outer ring */}
                <circle
                  cx="150" cy="150" r={R}
                  fill="none"
                  stroke={cfg.color}
                  strokeWidth="20"
                  strokeOpacity="0.08"
                  strokeDasharray={`${dash} ${CIRC}`}
                />
              </svg>

              {/* Center display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  data-testid="timer-display"
                  className="text-6xl font-extrabold font-mono tracking-tighter leading-none transition-colors duration-500"
                  style={{ color: cfg.color }}
                >
                  {display}
                </span>
                <span
                  data-testid="phase-label"
                  className="text-xs font-bold uppercase tracking-widest mt-3"
                  style={{ color: cfg.color }}
                >
                  {cfg.label}
                </span>
                {activeTask && isFocus && (
                  <span className="text-xs text-gray-400 font-medium mt-1 max-w-[160px] truncate text-center">
                    {activeTask.title}
                  </span>
                )}
              </div>
            </div>

            {/* Cycle dots */}
            <div className="flex items-center gap-3 mb-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full border-2 transition-all duration-300"
                  style={
                    i < (cycleCount % 4)
                      ? { background: cfg.color, borderColor: cfg.color }
                      : { background: 'transparent', borderColor: '#d1d5db' }
                  }
                />
              ))}
              <span
                className="text-xs font-bold ml-2 uppercase tracking-widest"
                style={{ color: cycleCount % 4 === 0 && cycleCount > 0 ? '#f59e0b' : '#9ca3af' }}
              >
                {cycleCount % 4 === 0 && cycleCount > 0 ? 'Cycle complete!' : `Pomodoro ${(cycleCount % 4) + (isIdle ? 0 : 1)} of 4`}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              {/* Primary action: Start / Pause */}
              {!isRunning && !isIdle ? (
                <button
                  onClick={resume}
                  className="flex items-center gap-2 text-white font-bold text-sm
                             px-8 py-3.5 rounded-xl transition-all duration-300"
                  style={{ background: cfg.color }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Resume
                </button>
              ) : !isRunning ? (
                <button
                  onClick={() => {
                    if (isIdle || isFocus) {
                      // Auto-move the selected task to IN_PROGRESS when focus starts
                      if (activeTaskId) {
                        const task = tasks.find(t => t.id === activeTaskId)
                        if (task && task.status === 'TODO') {
                          updateTask(activeTaskId, { status: 'IN_PROGRESS' })
                            .then(updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t)))
                            .catch(() => {})
                        }
                      }
                      startFocus(activeTaskId)
                    } else {
                      startBreak(phase)
                    }
                  }}
                  className="flex items-center gap-2 text-white font-bold text-sm
                             px-8 py-3.5 rounded-xl transition-all duration-300"
                  style={{ background: cfg.color }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {isBreak ? `Start ${cfg.label}` : 'Start Focus'}
                </button>
              ) : (
                <button
                  onClick={pause}
                  className="flex items-center gap-2 text-white font-bold text-sm
                             px-8 py-3.5 rounded-xl transition-all duration-300"
                  style={{ background: cfg.color }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                  Pause
                </button>
              )}

              {/* Skip — only while a phase is active */}
              {!isIdle && (
                <button
                  onClick={skipPhase}
                  title="Skip to next phase"
                  className="flex items-center gap-1.5 border-2 border-gray-200 text-gray-500
                             font-bold text-xs px-4 py-3.5 rounded-xl hover:border-gray-900
                             hover:text-gray-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
                  </svg>
                  Skip
                </button>
              )}

              {/* Reset — always visible */}
              <button
                onClick={reset}
                title="Reset timer"
                className="w-12 h-12 flex items-center justify-center border-2 border-gray-200
                           rounded-xl text-gray-400 hover:border-gray-900 hover:text-gray-900
                           transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Right: task + settings + sessions ─────────────────────────── */}
          <div className="col-span-2 flex flex-col gap-5">

            {/* Task picker */}
            <div className="bg-white border-2 border-gray-900 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: cfg.color }}>
                Focusing on
              </p>
              <TaskPicker
                tasks={tasks}
                selectedId={activeTaskId}
                onSelect={setActiveTaskId}
                disabled={isRunning}
              />
              {/* Pomodoro estimate hint */}
              {activeTask?.estimated_minutes && (
                <div className="mt-3 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <span className="text-base leading-none">🍅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-indigo-700">
                      ~{Math.ceil(activeTask.estimated_minutes / focusMins)} pomodoro{Math.ceil(activeTask.estimated_minutes / focusMins) !== 1 ? 's' : ''}
                      <span className="font-medium text-indigo-400 ml-1">({activeTask.estimated_minutes} min estimated)</span>
                    </p>
                  </div>
                  {cycleCount > 0 && (
                    <span className="text-xs font-bold text-indigo-400 shrink-0">
                      {cycleCount} done
                    </span>
                  )}
                </div>
              )}
              {isRunning && !activeTask?.estimated_minutes && (
                <p className="text-xs text-gray-400 mt-2 font-medium">
                  Task locked while timer is running
                </p>
              )}
            </div>

            {/* Duration settings */}
            <div className="bg-white border-2 border-gray-900 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowSettings(s => !s)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Duration Settings
                </p>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${showSettings ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {showSettings && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  <DurationInput
                    label="Focus"
                    value={focusMins}
                    onChange={v => { setFocusMins(v) }}
                    disabled={!isIdle}
                  />
                  <DurationInput
                    label="Short Break"
                    value={shortMins}
                    onChange={setShortMins}
                    min={1} max={30}
                    disabled={!isIdle}
                  />
                  <DurationInput
                    label="Long Break"
                    value={longMins}
                    onChange={setLongMins}
                    min={5} max={60}
                    disabled={!isIdle}
                  />
                  {!isIdle && (
                    <p className="text-xs text-gray-400 font-medium">
                      Reset timer to change durations
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Session log */}
            <div className="bg-white border-2 border-gray-900 rounded-2xl flex-1 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Today&apos;s Sessions
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                    <div className="w-10 h-10 border-2 border-dashed border-gray-200 rounded-full
                                    flex items-center justify-center mb-3">
                      <svg className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-gray-400">No sessions yet today</p>
                    <p className="text-xs text-gray-300 mt-1">Start a focus session to track your progress</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {sessions.map((s, i) => {
                      const task  = tasks.find(t => t.id === s.task_id)
                      const time  = s.completed_at
                        ? new Date(s.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : ''
                      const isFocusSession = s.phase === 'FOCUS'
                      return (
                        <li key={s.id || i} className="flex items-center gap-3 px-5 py-3">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: isFocusSession ? '#6366f1' : '#10b981' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">
                              {task?.title || (isFocusSession ? 'Free focus' : 'Break')}
                            </p>
                            <p className="text-xs text-gray-400">{time}</p>
                          </div>
                          <span className="text-xs font-mono font-bold text-gray-500 shrink-0">
                            {s.duration_minutes}m
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
