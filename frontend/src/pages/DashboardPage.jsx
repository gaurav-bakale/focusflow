/**
 * DashboardPage
 */

import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTimer, PHASES } from '../context/TimerContext'
import { fetchStats } from '../services/otherServices'
import { fetchTasks, markTaskComplete } from '../services/taskService'

function StatCard({ label, value, color }) {
  return (
    <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${color}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-800">{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { phase } = useTimer()
  const [stats, setStats] = useState({ tasks_done: 0, deep_work_hours: 0 })
  const [tasks, setTasks] = useState([])
  const [streak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([fetchStats(), fetchTasks()])
        setStats(s)
        const priority = t.filter(tk => !tk.is_complete).slice(0, 5)
        setTasks(priority)
      } catch (e) { /* non-blocking */ }
      setLoading(false)
    }
    load()
  }, [])

  async function handleComplete(taskId) {
    try {
      await markTaskComplete(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setStats(s => ({ ...s, tasks_done: s.tasks_done + 1 }))
    } catch (_) { /* non-blocking */ }
  }

  const total = tasks.length + stats.tasks_done
  const goalPct = total > 0 ? Math.round((stats.tasks_done / total) * 100) : 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">
          Hello, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1">Let&apos;s draw up today&apos;s plan.</p>
        {phase !== PHASES.IDLE && (
          <span className="mt-2 inline-block bg-indigo-100 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full">
            🍅 Focus session in progress
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading stats…</div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Tasks Done" value={stats.tasks_done} color="border-indigo-500" />
          <StatCard label="Deep Work" value={`${stats.deep_work_hours}h`} color="border-amber-400" />
          <StatCard label="Current Streak" value={`${streak} Days`} color="border-green-500" />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Priority Checklist</h2>
        {tasks.length === 0 ? (
          <p className="text-gray-400 text-sm">No pending tasks — great work! 🎉</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map(task => (
              <li key={task.id} className="flex items-center gap-3 group">
                <button
                  onClick={() => handleComplete(task.id)}
                  className="w-5 h-5 rounded border-2 border-gray-300 group-hover:border-indigo-500 flex items-center justify-center transition-colors"
                  aria-label={`Mark ${task.title} complete`}
                >
                  <span className="text-indigo-500 text-xs hidden group-hover:block">✓</span>
                </button>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm text-gray-700">{task.title}</span>
                  {task.categories && task.categories.length > 0 && (
                    <div className="flex gap-1">
                      {task.categories.slice(0, 2).map(cat => (
                        <span key={cat} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                          {cat}
                        </span>
                      ))}
                      {task.categories.length > 2 && (
                        <span className="text-xs text-gray-400">+{task.categories.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${task.priority === 'HIGH' ? 'bg-red-100 text-red-600' :
                    task.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
                      'bg-green-100 text-green-600'}`}>
                  {task.priority}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-600">Daily Goal</span>
          <span className="text-sm font-bold text-indigo-600">{goalPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${goalPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}