/**
 * DashboardPage — Home view after authentication.
 *
 * Sections:
 *   • Greeting + subtitle
 *   • Stats row (tasks done, deep work, current streak)
 *   • Priority Checklist with inline add
 *   • Daily Goal badge
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer, PHASES } from '../context/TimerContext'
import { fetchStats } from '../services/otherServices'
import { fetchTasks, markTaskComplete, createTask } from '../services/taskService'

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white border-2 border-gray-900 rounded-lg p-5 relative overflow-hidden">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-extrabold text-gray-900 font-mono">{value}</p>
      <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${color}`} />
    </div>
  )
}

const PRIORITY_CONFIG = {
  HIGH:   { bg: 'bg-red-50',    text: 'text-red-600',   dot: 'bg-red-400'   },
  MEDIUM: { bg: 'bg-amber-50',  text: 'text-amber-600', dot: 'bg-amber-400' },
  LOW:    { bg: 'bg-green-50',  text: 'text-green-600', dot: 'bg-green-400' },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { phase } = useTimer()
  const [stats, setStats]   = useState({ tasks_done: 0, deep_work_hours: 0 })
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(null)
  const [newItem, setNewItem] = useState('')
  const [adding, setAdding] = useState(false)

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

  async function handleAddItem(e) {
    e.preventDefault()
    const title = newItem.trim()
    if (!title) return
    setAdding(true)
    try {
      const created = await createTask({ title, priority: 'MEDIUM', status: 'todo' })
      setTasks(prev => [...prev, created])
      setNewItem('')
    } catch (_) { /* non-blocking */ }
    setAdding(false)
  }

  const totalTasks = tasks.length + stats.tasks_done
  const goalPct    = totalTasks > 0 ? Math.round((stats.tasks_done / totalTasks) * 100) : 0

  // Calculate streak from stats (days with at least one completed task)
  const streakDays = stats.streak_days ?? 0

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="min-h-full">
      <div className="px-10 py-10 max-w-4xl mx-auto">

        {/* Active timer callout */}
        {phase !== PHASES.IDLE && (
          <Link
            to="/timer"
            className="inline-flex items-center gap-2 bg-gray-900 text-white
                       text-sm font-medium px-4 py-2 rounded-lg mb-6 hover:bg-gray-800 transition-colors"
          >
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Focus session active
          </Link>
        )}

        {/* Greeting */}
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Hello, {firstName}.
          </h1>
          <p className="text-base text-gray-400 mt-1">Let's draw up today's plan.</p>
        </div>

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-3 gap-5 mb-10">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-50 border-2 border-gray-200 rounded-lg h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5 mb-10">
            <StatCard
              label="Tasks Done"
              value={stats.tasks_done}
              color="bg-emerald-400"
            />
            <StatCard
              label="Deep Work"
              value={`${stats.deep_work_hours}h`}
              color="bg-rose-400"
            />
            <StatCard
              label="Current Streak"
              value={`${streakDays} Day${streakDays !== 1 ? 's' : ''}`}
              color="bg-amber-400"
            />
          </div>
        )}

        {/* Priority Checklist */}
        <div className="bg-white border-2 border-gray-900 rounded-lg mb-10">
          <div className="px-6 py-5 border-b-2 border-gray-900">
            <h2 className="text-lg font-extrabold text-gray-900">Priority Checklist</h2>
          </div>

          <div className="px-6 py-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="py-3 flex items-center gap-3">
                  <div className="w-5 h-5 rounded border-2 border-gray-200 animate-pulse" />
                  <div className="flex-1 h-4 bg-gray-100 rounded animate-pulse" />
                </div>
              ))
            ) : tasks.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400">No tasks yet. Add one below.</p>
              </div>
            ) : (
              tasks.map(task => {
                const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.LOW
                return (
                  <div key={task.id} className="py-3 flex items-center gap-3 group border-b border-gray-100 last:border-0">
                    <button
                      onClick={() => handleComplete(task.id)}
                      disabled={completing === task.id}
                      aria-label={`Mark ${task.title} complete`}
                      className="w-5 h-5 rounded border-2 border-gray-900 flex items-center justify-center
                                 shrink-0 hover:bg-gray-900 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {completing === task.id ? (
                        <span className="w-2.5 h-2.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <p className="flex-1 text-sm font-medium text-gray-800">{task.title}</p>

                    {task.deadline && (
                      <p className="text-xs text-gray-400 shrink-0 font-mono">
                        {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}

                    <span className={`text-xs px-2 py-0.5 rounded font-bold shrink-0 ${pc.bg} ${pc.text}`}>
                      {task.priority}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Add item */}
          <div className="px-6 py-4 border-t-2 border-gray-900">
            <form onSubmit={handleAddItem} className="flex items-center gap-2">
              <button
                type="submit"
                disabled={adding || !newItem.trim()}
                className="text-sm font-bold text-gray-900 border-2 border-gray-900 rounded px-3 py-1.5
                           hover:bg-gray-900 hover:text-white transition-colors disabled:opacity-40"
              >
                + Add Item
              </button>
              <input
                type="text"
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                placeholder="What needs to get done?"
                className="flex-1 text-sm border-0 outline-none bg-transparent text-gray-700 placeholder-gray-300"
              />
            </form>
          </div>
        </div>

        {/* Daily Goal */}
        {!loading && (
          <div className="inline-block border-2 border-gray-900 rounded-lg px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Daily Goal</p>
            <p className="text-3xl font-extrabold text-gray-900 font-mono">{goalPct}%</p>
          </div>
        )}

      </div>
    </div>
  )
}
