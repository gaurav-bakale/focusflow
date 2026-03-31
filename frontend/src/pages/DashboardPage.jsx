/**
 * DashboardPage — Home view after authentication.
 *
 * Sections:
 *   • Greeting + date + active timer callout
 *   • Stats row (tasks done, deep work hours, streak)
 *   • Priority task checklist
 *   • Daily goal progress bar
 *   • Quick actions
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer, PHASES } from '../context/TimerContext'
import { fetchStats } from '../services/otherServices'
import { fetchTasks, markTaskComplete } from '../services/taskService'

function greeting(name) {
  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return `${salutation}, ${name?.split(' ')[0] || 'there'}`
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function StatCard({ label, value, sub, icon, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xl">{icon}</span>
        {sub && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${accent}`}>{sub}</span>}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-0.5">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

const PRIORITY_CONFIG = {
  HIGH:   { bg: 'bg-red-50',    text: 'text-red-600',   dot: 'bg-red-400'   },
  MEDIUM: { bg: 'bg-amber-50',  text: 'text-amber-600', dot: 'bg-amber-400' },
  LOW:    { bg: 'bg-green-50',  text: 'text-green-600', dot: 'bg-green-400' },
}

function QuickAction({ to, icon, label, desc }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl
                 hover:border-indigo-200 hover:shadow-sm transition-all group"
    >
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">{label}</p>
        <p className="text-xs text-gray-400 truncate">{desc}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 ml-auto shrink-0 transition-colors"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { phase } = useTimer()
  const [stats, setStats]   = useState({ tasks_done: 0, deep_work_hours: 0 })
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([fetchStats(), fetchTasks()])
        setStats(s ?? { tasks_done: 0, deep_work_hours: 0 })
        setTasks(t.filter(tk => !tk.is_complete).slice(0, 6))
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

  const totalTasks = tasks.length + stats.tasks_done
  const goalPct    = totalTasks > 0 ? Math.round((stats.tasks_done / totalTasks) * 100) : 0

  return (
    <div className="min-h-full">
      {/* Page header */}
      <div className="border-b border-gray-100 px-8 py-6">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{greeting(user?.name)}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{formatDate()}</p>
          </div>

          {phase !== PHASES.IDLE && (
            <Link
              to="/timer"
              className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700
                         text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              Focus session active
            </Link>
          )}
        </div>
      </div>

      <div className="px-8 py-8 max-w-4xl mx-auto space-y-8">

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-50 rounded-xl h-24 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              icon="✅"
              label="Tasks completed today"
              value={stats.tasks_done}
              sub={stats.tasks_done > 0 ? `+${stats.tasks_done}` : null}
              accent="bg-green-50 text-green-600"
            />
            <StatCard
              icon="⏱"
              label="Deep work today"
              value={`${stats.deep_work_hours}h`}
              sub={stats.deep_work_hours > 0 ? 'Tracked' : null}
              accent="bg-indigo-50 text-indigo-600"
            />
            <StatCard
              icon="🔥"
              label="Daily goal progress"
              value={`${goalPct}%`}
              sub={goalPct >= 80 ? 'On track' : null}
              accent="bg-amber-50 text-amber-600"
            />
          </div>
        )}

        {/* Priority tasks */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Priority Tasks</h2>
              <p className="text-xs text-gray-400 mt-0.5">Your most important pending items</p>
            </div>
            <Link
              to="/board"
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline underline-offset-2"
            >
              View all →
            </Link>
          </div>

          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-gray-100 animate-pulse" />
                  <div className="flex-1 h-3 bg-gray-100 rounded animate-pulse" />
                  <div className="w-12 h-5 bg-gray-100 rounded-full animate-pulse" />
                </div>
              ))
            ) : tasks.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-2xl mb-2">🎉</p>
                <p className="text-sm font-medium text-gray-700">All caught up!</p>
                <p className="text-xs text-gray-400 mt-1">No pending tasks. Time to add some goals.</p>
                <Link
                  to="/board"
                  className="inline-block mt-4 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Add a task →
                </Link>
              </div>
            ) : (
              tasks.map(task => {
                const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.LOW
                return (
                  <div key={task.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors group">
                    <button
                      onClick={() => handleComplete(task.id)}
                      disabled={completing === task.id}
                      aria-label={`Mark ${task.title} complete`}
                      className="w-4 h-4 rounded border-2 border-gray-300 group-hover:border-indigo-400
                                 flex items-center justify-center transition-colors shrink-0
                                 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {completing === task.id
                        ? <span className="w-2 h-2 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        : <span className="text-indigo-500 text-xs opacity-0 group-hover:opacity-100">✓</span>
                      }
                    </button>

                    <p className="flex-1 text-sm text-gray-700 truncate">{task.title}</p>

                    {task.deadline && (
                      <p className="text-xs text-gray-400 shrink-0">
                        {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}

                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1 ${pc.bg} ${pc.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                      {task.priority}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Daily goal progress */}
        {!loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Daily Goal</h2>
                <p className="text-xs text-gray-400 mt-0.5">{stats.tasks_done} of {totalTasks} tasks complete</p>
              </div>
              <span className="text-sm font-bold text-indigo-600">{goalPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${goalPct}%` }}
              />
            </div>
            {goalPct >= 100 && (
              <p className="text-xs text-green-600 font-medium mt-2">🎉 You hit your daily goal!</p>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction to="/timer"    icon="⏱" label="Start Focus Session"  desc="Begin a Pomodoro timer" />
            <QuickAction to="/board"    icon="✅" label="Manage Tasks"         desc="View and update your board" />
            <QuickAction to="/calendar" icon="📅" label="View Calendar"        desc="Plan your time blocks" />
            <QuickAction to="/ai"       icon="✨" label="AI Task Breakdown"    desc="Let AI help prioritize" />
          </div>
        </div>
      </div>
    </div>
  )
}
