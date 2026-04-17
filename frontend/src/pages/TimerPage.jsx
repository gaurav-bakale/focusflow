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
import { useTheme } from '../context/ThemeContext'
import { PHASES } from '../context/timerPhases'
import { fetchTasks, updateTask } from '../services/taskService'
import { fetchSessions } from '../services/otherServices'
import useMagnetic from '../hooks/useMagnetic'
import Odometer from '../components/Odometer'
import SketchLine from '../components/SketchLine'

// ── Phase config factory ───────────────────────────────────────────────────────
// IDLE uses different colors in dark vs light so the ring is always visible.
function buildPhaseConfig(dark) {
  return {
    [PHASES.IDLE]:        { label: 'Ready',       color: dark ? '#94a3b8' : '#3a6758', bg: 'bg-slate-50 dark:bg-slate-900',        tab: 'Focus'       },
    [PHASES.FOCUS]:       { label: 'Focus',        color: '#6366f1',                    bg: 'bg-indigo-50 dark:bg-indigo-950/40',   tab: 'Focus'       },
    [PHASES.SHORT_BREAK]: { label: 'Short Break',  color: '#10b981',                    bg: 'bg-emerald-50 dark:bg-emerald-950/40', tab: 'Short Break' },
    [PHASES.LONG_BREAK]:  { label: 'Long Break',   color: '#0ea5e9',                    bg: 'bg-sky-50 dark:bg-sky-950/40',         tab: 'Long Break'  },
  }
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
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => !disabled && onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          className="w-6 h-6 rounded-full flex items-center justify-center
                     text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
          style={{ background: '#ecefe7', border: 'none' }}
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
          className="w-10 text-center text-sm font-bold rounded-lg py-0.5
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:outline-none transition-colors disabled:opacity-40"
          style={{ border: '1px solid #dee4da' }}
        />
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">min</span>
        <button
          onClick={() => !disabled && onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          className="w-6 h-6 rounded-full flex items-center justify-center
                     text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
          style={{ background: '#ecefe7', border: 'none' }}
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
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left
                    transition-colors bg-white dark:bg-gray-800 ${disabled ? 'opacity-50 cursor-not-allowed' :
                    'hover:border-gray-900 dark:hover:border-gray-400 cursor-pointer'}
                    ${open ? '' : ''}`}
        style={{ border: '1px solid #dee4da' }}
      >
        {selected ? (
          <>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[selected.priority] || 'bg-gray-300'}`} />
            <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{selected.title}</span>
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
            <span className="flex-1 text-sm font-medium text-gray-400 dark:text-gray-500">Focus without a task…</span>
          </>
        )}
        <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-gray-900
                        rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto"
          style={{ border: '1px solid #dee4da' }}
        >
          {/* No task option */}
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
              !selectedId ? 'bg-gray-50 dark:bg-gray-800' : ''
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
            <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">No task — free focus</span>
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-800" />
          {tasks.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">No active tasks</div>
          ) : (
            tasks.map(t => (
              <button
                key={t.id}
                onClick={() => { onSelect(t.id); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                  t.id === selectedId ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`} />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.title}</span>
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
  const startBtnRef = useMagnetic({ strength: 0.25, radius: 110 })

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


  const { dark } = useTheme()
  const PHASE_CONFIG = buildPhaseConfig(dark)
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[PHASES.IDLE]

  const isIdle      = phase === PHASES.IDLE
  const isFocus     = phase === PHASES.FOCUS
  const isBreak     = phase === PHASES.SHORT_BREAK || phase === PHASES.LONG_BREAK
  const activeTask  = tasks.find(t => t.id === activeTaskId)

  // SVG ring
  const R    = 130
  const CIRC = 2 * Math.PI * R
  const trackColor = dark ? '#1e293b' : '#dee4da'
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
    <div
      style={{
        background: isFocus ? 'rgba(58,103,88,0.04)' : 'transparent',
        minHeight: '100%',
        transition: 'background 0.6s ease',
      }}
    >
      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#3a6758' }}>
            {isFocus ? 'In Focus' : isBreak ? 'On Break' : 'Pomodoro'}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 900, color: '#2e342d' }}>
            {isFocus ? 'Deep work' : isBreak ? 'Breathe' : 'Focus timer'}<span style={{ color: '#3a6758' }}>.</span>
          </h1>
          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: '#5b6159' }}>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'animate-pulse' : ''}`} style={{ background: cfg.color }} />
              <span className="font-bold">{cfg.label}</span>
            </span>
            <span style={{ color: '#dee4da' }}>·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-bold">{sessionsToday}</span>
              <span>session{sessionsToday !== 1 ? 's' : ''} today</span>
            </span>
            <span style={{ color: '#dee4da' }}>·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="font-bold">{totalFocusMins}</span>
              <span>min focused</span>
            </span>
            {activeTask && (
              <>
                <span style={{ color: '#dee4da' }}>·</span>
                <span className="flex items-center gap-1.5 truncate max-w-[260px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#3a6758' }} />
                  <span className="font-bold truncate">{activeTask.title}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Stats strip ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Sessions Today', value: sessionsToday,  suffix: '',    color: '#6366f1', icon: (c) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={c} fillOpacity="0.15"/><path d="M8 12.5l3 3 5-6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )},
            { label: 'Focus Time',     value: totalFocusMins, suffix: 'min', color: '#10b981', icon: (c) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5"/><path d="M12 7v5l3.5 2" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>
            )},
            { label: 'Full Cycles',    value: cyclesComplete, suffix: '',    color: '#f59e0b', icon: (c) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l2 4 4.5 0.6-3.3 3.2 0.8 4.5-4-2.1-4 2.1 0.8-4.5-3.3-3.2 4.5-0.6z" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>
            )},
          ].map(({ label, value, suffix, color, icon }, i) => (
            <div
              key={label}
              className={`rounded-2xl p-5 relative overflow-hidden card-enter-${i + 1}`}
              style={{
                background: 'rgba(243,244,238,0.72)',
                backdropFilter: 'blur(14px) saturate(140%)',
                WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                border: '1px solid rgba(222,228,218,0.7)',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#aeb4aa' }}>{label}</p>
                <span className="shrink-0 -mt-0.5">{icon(color)}</span>
              </div>
              <p className="text-3xl font-extrabold font-mono flex items-baseline gap-1" style={{ color }}>
                <Odometer value={value} />
                {suffix && <span className="text-base font-bold" style={{ color: '#aeb4aa' }}>{suffix}</span>}
              </p>
              <SketchLine color={color} thickness={4} />
            </div>
          ))}
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-6">

          {/* ── Left: timer ──────────────────────────────────────────────────── */}
          <div className="col-span-3 rounded-2xl p-8 flex flex-col items-center"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px) saturate(150%)', WebkitBackdropFilter: 'blur(16px) saturate(150%)', boxShadow: '0 4px 20px rgba(46,52,45,0.06)', border: '1px solid rgba(255,255,255,0.55)' }}
          >

            {/* Phase tabs */}
            <div className="flex rounded-xl p-1 mb-8 w-full max-w-sm"
              style={{ background: '#f3f4ee' }}
            >
              {[
                { p: PHASES.FOCUS,       label: 'Focus',       color: '#6366f1' },
                { p: PHASES.SHORT_BREAK, label: 'Short Break', color: '#10b981' },
                { p: PHASES.LONG_BREAK,  label: 'Long Break',  color: '#0ea5e9' },
              ].map(({ p, label }) => {
                const isActive = phase === p || (isIdle && p === PHASES.FOCUS)
                return (
                  <button
                    key={p}
                    disabled={isRunning}
                    onClick={() => selectPhase(p)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                      ${isRunning ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    style={isActive
                      ? { background: '#3a6758', color: '#ffffff' }
                      : { background: '#ecefe7', color: '#5b6159' }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Ring timer */}
            <div className="relative mb-6" style={{ width: 300, height: 300 }}>
              {/* bg container */}
              <div className="absolute inset-0 rounded-full"
                style={{ background: '#f3f4ee', boxShadow: '0 20px 50px rgba(46,52,45,0.08)' }}
              />
              <svg width="300" height="300" className="-rotate-90 relative" viewBox="0 0 300 300">
                {/* Track */}
                <circle cx="150" cy="150" r={R} fill="none" stroke={trackColor} strokeWidth="12" />
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
                  className="text-6xl tracking-tighter leading-none transition-colors duration-500"
                  style={{ color: cfg.color, fontFamily: 'Epilogue, sans-serif', fontWeight: 900 }}
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
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-1 max-w-[160px] truncate text-center">
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
                  className="w-3 h-3 rounded-full transition-all duration-300"
                  style={
                    i < (cycleCount % 4)
                      ? { background: cfg.color, borderColor: cfg.color, border: '2px solid' }
                      : { background: 'transparent', borderColor: '#d1d5db', border: '2px solid' }
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
                  ref={startBtnRef}
                  onClick={resume}
                  className="magnetic flex items-center gap-2 text-white font-bold text-sm
                             px-8 py-3.5 rounded-2xl"
                  style={{ background: '#3a6758' }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Resume
                </button>
              ) : !isRunning ? (
                <button
                  ref={startBtnRef}
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
                  className="magnetic flex items-center gap-2 text-white font-bold text-sm
                             px-8 py-3.5 rounded-2xl"
                  style={{ background: '#3a6758' }}
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
                             px-8 py-3.5 rounded-2xl transition-all duration-300"
                  style={{ background: '#3a6758' }}
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
                  className="flex items-center gap-1.5 font-bold text-xs px-4 py-3.5 rounded-2xl transition-colors"
                  style={{ background: '#ecefe7', color: '#5b6159' }}
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
                className="w-12 h-12 flex items-center justify-center rounded-2xl transition-colors"
                style={{ background: '#ecefe7', color: '#5b6159' }}
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
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px) saturate(150%)', WebkitBackdropFilter: 'blur(16px) saturate(150%)', boxShadow: '0 4px 20px rgba(46,52,45,0.06)', border: '1px solid rgba(255,255,255,0.55)' }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 700, color: '#2e342d' }}
              >
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
                <div className="mt-3 flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800 rounded-lg px-3 py-2">
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
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 font-medium">
                  Task locked while timer is running
                </p>
              )}
            </div>

            {/* Duration settings */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px) saturate(150%)', WebkitBackdropFilter: 'blur(16px) saturate(150%)', boxShadow: '0 4px 20px rgba(46,52,45,0.06)', border: '1px solid rgba(255,255,255,0.55)' }}
            >
              <button
                onClick={() => setShowSettings(s => !s)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <p className="text-xs font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 700, color: '#2e342d' }}
                >
                  Duration Settings
                </p>
                <svg
                  className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${showSettings ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {showSettings && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
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
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      Reset timer to change durations
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Session log */}
            <div className="rounded-2xl flex-1 overflow-hidden flex flex-col"
              style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px) saturate(150%)', WebkitBackdropFilter: 'blur(16px) saturate(150%)', boxShadow: '0 4px 20px rgba(46,52,45,0.06)', border: '1px solid rgba(255,255,255,0.55)' }}
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 700, color: '#2e342d' }}
                >
                  Today&apos;s Sessions
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="mb-3">
                      {/* Cup body */}
                      <rect x="16" y="30" width="34" height="26" rx="6" fill="#f3f4ee" stroke="#dee4da" strokeWidth="1.5"/>
                      {/* Handle */}
                      <path d="M50 38 Q62 38 62 48 Q62 58 50 56" stroke="#dee4da" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      {/* Coffee surface */}
                      <ellipse cx="33" cy="38" rx="12" ry="4" fill="#dee4da"/>
                      {/* Saucer */}
                      <ellipse cx="33" cy="57" rx="20" ry="3" fill="#ecefe7"/>
                      {/* Steam */}
                      <path d="M24 24 Q22 19 24 14" stroke="#aeb4aa" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <path d="M33 22 Q31 16 33 10" stroke="#aeb4aa" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <path d="M42 24 Q40 19 42 14" stroke="#aeb4aa" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      {/* Sparkle */}
                      <text x="50" y="16" fontSize="13">✨</text>
                    </svg>
                    <p className="text-xs font-semibold" style={{ color:'#5b6159' }}>No sessions yet today</p>
                    <p className="text-xs mt-1" style={{ color:'#aeb4aa' }}>Start a focus session to track your progress</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50 dark:divide-gray-800">
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
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {task?.title || (isFocusSession ? 'Free focus' : 'Break')}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{time}</p>
                          </div>
                          <span className="text-xs font-mono font-bold text-gray-500 dark:text-gray-400 shrink-0">
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
