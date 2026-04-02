/**
 * DashboardPage — Home view after authentication.
 *
 * Matches the app's editorial black-border aesthetic.
 * New features vs original:
 *   • Priority picker on quick-add (HIGH / MEDIUM / LOW chips)
 *   • Completion progress ring in analytics
 *   • Streak + completion rate stat cards
 *   • Sortable / grouped task list with inline complete
 *   • "This Week" summary
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer } from '../context/TimerContext'
import { PHASES } from '../context/timerPhases'
import { fetchStats } from '../services/otherServices'
import { fetchTasks, markTaskComplete, createTask, fetchTaskAnalytics } from '../services/taskService'
import SketchLine from '../components/SketchLine'
import AITaskGenerator from '../components/AITaskGenerator'

// ── Priority config ───────────────────────────────────────────────────────────
const PRIORITY_DOT = {
  HIGH:   'bg-red-400',
  MEDIUM: 'bg-amber-400',
  LOW:    'bg-gray-300',
}

const PRIORITY_LABEL = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

// ── Small inline stat card (matches Layout's daily-goal card style) ───────────
function StatCard({ label, value, color }) {
  return (
    <div className="sketch-hover bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg p-5 relative overflow-hidden">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-extrabold font-mono" style={{ color }}>{value}</p>
      <SketchLine color={color} thickness={4} />
    </div>
  )
}

// ── Compact progress ring ─────────────────────────────────────────────────────
function ProgressRing({ pct }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const dash = circ * (pct / 100)
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke="#6366f1" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 font-mono leading-none">{pct}%</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 font-bold mt-0.5">done</span>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user }   = useAuth()
  const { phase }  = useTimer()

  const [stats, setStats]         = useState({ tasks_done: 0, deep_work_hours: 0 })
  const [tasks, setTasks]         = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [completing, setCompleting] = useState(null)

  // Quick-add
  const [newTitle, setNewTitle]           = useState('')
  const [newPriority, setNewPriority]     = useState('MEDIUM')
  const [newDeadline, setNewDeadline]     = useState('')
  const [newTime, setNewTime]             = useState('')
  const [newRecurrence, setNewRecurrence] = useState('NONE')
  const [adding, setAdding]               = useState(false)
  const [addError, setAddError]           = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [s, t, a] = await Promise.all([
          fetchStats(),
          fetchTasks(),
          fetchTaskAnalytics(),
        ])
        setStats(s ?? { tasks_done: 0, deep_work_hours: 0 })
        setTasks(t.filter(tk => !tk.is_complete).slice(0, 8))
        setAnalytics(a)
      } catch (_) { /* non-blocking */ }
      setLoading(false)
    }
    load()
  }, [])

  async function handleComplete(taskId) {
    setCompleting(taskId)
    try {
      await markTaskComplete(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setStats(s => ({ ...s, tasks_done: s.tasks_done + 1 }))
    } catch (_) { /* non-blocking */ }
    setCompleting(null)
  }

  async function handleAddTask(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setAdding(true)
    setAddError('')
    try {
      const created = await createTask({
        title,
        priority: newPriority,
        status: 'TODO',
        deadline: newDeadline || null,
        due_time: newTime || null,
        recurrence: newRecurrence,
      })
      setTasks(prev => [created, ...prev].slice(0, 8))
      setNewTitle('')
      setNewPriority('MEDIUM')
      setNewDeadline('')
      setNewTime('')
      setNewRecurrence('NONE')
    } catch {
      setAddError('Could not add task — try again.')
    }
    setAdding(false)
  }

  const firstName  = user?.name?.split(' ')[0] || 'there'
  const donePct    = analytics ? Math.round(analytics.completion_rate) : 0
  const streakDays = stats.streak_days ?? 0

  // Sort: HIGH → MEDIUM → LOW, then by deadline asc
  const sortedTasks = [...tasks].sort((a, b) => {
    const o = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    if (o[a.priority] !== o[b.priority]) return o[a.priority] - o[b.priority]
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline)
    return a.deadline ? -1 : b.deadline ? 1 : 0
  })

  return (
    <div className="px-10 py-10 max-w-5xl mx-auto">

      {/* ── Timer callout ─────────────────────────────────────────────────── */}
      {phase !== PHASES.IDLE && (
        <Link
          to="/timer"
          className="inline-flex items-center gap-2 bg-gray-900 text-white
                     text-sm font-bold px-4 py-2 rounded-lg mb-6 hover:bg-gray-700 transition-colors"
        >
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Focus session active
        </Link>
      )}

      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
          Hello, <span style={{ color: '#6366f1' }}>{firstName}</span>.
        </h1>
        <p className="text-base text-gray-400 dark:text-gray-500 mt-1">
          {loading
            ? "Loading your plan…"
            : sortedTasks.length === 0
              ? "You're all caught up. Add a task to get started."
              : `${sortedTasks.length} active task${sortedTasks.length !== 1 ? 's' : ''} — let's get to work.`}
        </p>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Tasks Done"    value={stats.tasks_done}          color="#34D399" />
          <StatCard label="Deep Work"     value={`${stats.deep_work_hours}h`} color="#FB7185" />
          <StatCard label="Streak"        value={`${streakDays}d`}           color="#FBBF24" />
          <StatCard label="Completion"    value={`${donePct}%`}              color="#A78BFA" />
        </div>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: quick-add + task list ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick-add card */}
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
              New Task
            </h2>
            <form onSubmit={handleAddTask}>
              {/* Title input */}
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="What needs to get done?"
                className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors
                           placeholder-gray-300 dark:placeholder-gray-600 mb-3"
              />

              {/* Date + Time row */}
              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  value={newDeadline}
                  onChange={e => setNewDeadline(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium
                             bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
                />
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  disabled={!newDeadline}
                  title={newDeadline ? 'Set a specific time' : 'Set a date first'}
                  className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium
                             bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {/* Task type chips */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Type</span>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { r: 'NONE',     label: 'One-time', activeClass: 'border-gray-600 bg-gray-600 text-white' },
                    { r: 'DAILY',    label: '↻ Daily',    activeClass: 'border-indigo-500 bg-indigo-500 text-white' },
                    { r: 'WEEKDAYS', label: '↻ Weekdays', activeClass: 'border-blue-500 bg-blue-500 text-white' },
                    { r: 'WEEKLY',   label: '↻ Weekly',   activeClass: 'border-violet-500 bg-violet-500 text-white' },
                    { r: 'MONTHLY',  label: '↻ Monthly',  activeClass: 'border-pink-500 bg-pink-500 text-white' },
                  ].map(({ r, label, activeClass }) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewRecurrence(r)}
                      className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                        newRecurrence === r
                          ? activeClass
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority chips + submit row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Priority</span>
                <div className="flex gap-1.5">
                  {[
                    { p: 'HIGH',   activeClass: 'border-red-500 bg-red-500 text-white'   },
                    { p: 'MEDIUM', activeClass: 'border-amber-500 bg-amber-500 text-white' },
                    { p: 'LOW',    activeClass: 'border-gray-400 bg-gray-400 text-white'  },
                  ].map(({ p, activeClass }) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPriority(p)}
                      className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                        newPriority === p
                          ? activeClass
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={adding || !newTitle.trim()}
                  className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900
                             text-xs font-bold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {adding ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                  {adding ? 'Adding…' : 'Add Task'}
                </button>
              </div>

              {addError && (
                <p className="mt-2 text-xs text-red-500 font-medium">{addError}</p>
              )}
            </form>
          </div>

          {/* Task list card */}
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b-2 border-gray-900 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Active Tasks
              </h2>
              <Link
                to="/board"
                className="text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                View board →
              </Link>
            </div>

            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border-2 border-gray-200 dark:border-gray-700 animate-pulse shrink-0" />
                    <div className="flex-1 h-3.5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    <div className="w-12 h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : sortedTasks.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">No active tasks.</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Add one above to get started.</p>
              </div>
            ) : (
              <ul>
                {sortedTasks.map((task, i) => {
                  const isOverdue = task.deadline &&
                    task.status !== 'DONE' &&
                    new Date(task.deadline) < new Date()
                  return (
                    <li
                      key={task.id}
                      className={`flex items-center gap-3 px-6 py-3.5 group transition-colors
                        hover:bg-gray-50 dark:hover:bg-gray-800 ${i !== 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}
                    >
                      {/* Priority dot */}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-300'}`} />

                      {/* Complete button */}
                      <button
                        onClick={() => handleComplete(task.id)}
                        disabled={completing === task.id}
                        aria-label={`Complete ${task.title}`}
                        className="w-5 h-5 rounded-full border-2 border-gray-300
                                   group-hover:border-gray-500 flex items-center justify-center
                                   shrink-0 transition-colors hover:bg-gray-900
                                   hover:border-gray-900 disabled:opacity-40"
                      >
                        {completing === task.id ? (
                          <span className="w-2.5 h-2.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-2.5 h-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      {/* Title */}
                      <p className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {task.title}
                      </p>

                      {/* Task type badge — always visible */}
                      {(() => {
                        const r = task.recurrence || 'NONE'
                        const cfg = {
                          NONE:     { label: 'One-time', cls: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
                          DAILY:    { label: '↻ Daily',    cls: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' },
                          WEEKDAYS: { label: '↻ Weekdays', cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' },
                          WEEKLY:   { label: '↻ Weekly',   cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700' },
                          MONTHLY:  { label: '↻ Monthly',  cls: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30 border-pink-200 dark:border-pink-700' },
                        }[r] || { label: 'One-time', cls: 'text-gray-500 bg-gray-100 border-gray-200' }
                        return (
                          <span className={`hidden sm:inline-flex items-center text-xs font-bold border px-1.5 py-0.5 rounded shrink-0 ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                        )
                      })()}

                      {/* Deadline + time */}
                      {task.deadline && (
                        <span className={`text-xs font-mono shrink-0 ${
                          isOverdue ? 'text-red-500 font-bold' : 'text-gray-400'
                        }`}>
                          {isOverdue && '⚠ '}
                          {new Date(task.deadline + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })}
                          {task.due_time && (
                            <span className="ml-1 opacity-70">
                              {(() => {
                                const [h, m] = task.due_time.split(':').map(Number)
                                return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
                              })()}
                            </span>
                          )}
                        </span>
                      )}

                      {/* Priority label */}
                      <span className="text-xs font-bold text-gray-400 dark:text-gray-500 shrink-0 w-14 text-right">
                        {PRIORITY_LABEL[task.priority]}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right: analytics ──────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Completion ring */}
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-5">
              Progress
            </h2>

            {loading ? (
              <div className="w-24 h-24 rounded-full border-8 border-gray-200 dark:border-gray-700 animate-pulse mx-auto mb-5" />
            ) : (
              <div className="mb-5">
                <ProgressRing pct={donePct} />
              </div>
            )}

            {/* Status bars */}
            <div className="space-y-3">
              {loading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
                ))
              ) : analytics ? (
                [
                  { label: 'Done',        count: analytics.by_status.DONE,        shade: 'bg-emerald-500' },
                  { label: 'In Progress', count: analytics.by_status.IN_PROGRESS, shade: 'bg-indigo-400'  },
                  { label: 'To Do',       count: analytics.by_status.TODO,        shade: 'bg-gray-300'    },
                ].map(({ label, count, shade }) => (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</span>
                      <span className="text-xs font-mono font-extrabold text-gray-900 dark:text-gray-100">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${shade} transition-all duration-700`}
                        style={{ width: analytics.total > 0 ? `${Math.round((count / analytics.total) * 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))
              ) : null}
            </div>
          </div>

          {/* Priority breakdown */}
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
              By Priority
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : analytics ? (
              <div className="space-y-3">
                {[
                  { label: 'High',   count: analytics.by_priority.HIGH,   dot: 'bg-red-400'   },
                  { label: 'Medium', count: analytics.by_priority.MEDIUM, dot: 'bg-amber-400' },
                  { label: 'Low',    count: analytics.by_priority.LOW,    dot: 'bg-gray-300'  },
                ].map(({ label, count, dot }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex-1">{label}</span>
                    <span className="text-xs font-mono font-extrabold text-gray-900 dark:text-gray-100">{count}</span>
                  </div>
                ))}

                {analytics.overdue > 0 && (
                  <div className="mt-2 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
                    <span className="text-xs font-bold text-red-500">
                      {analytics.overdue} overdue
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* AI Task Planner */}
          <AITaskGenerator onTasksCreated={() => {
            fetchTasks().then(t => setTasks(t.filter(tk => !tk.is_complete).slice(0, 8))).catch(() => {})
          }} />

          {/* This week */}
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
              This Week
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : analytics ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Completed</span>
                  <span className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">
                    {analytics.completed_this_week}
                  </span>
                </div>
                <div className="h-px bg-gray-100 dark:bg-gray-800" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Today</span>
                  <span className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">
                    {analytics.completed_today}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

        </div>
      </div>

    </div>
  )
}
