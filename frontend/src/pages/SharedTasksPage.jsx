/**
 * SharedTasksPage — View tasks shared with the current user.
 *
 * Displays a list of tasks that other users have shared with the current user,
 * including the task owner's name, permission level, and task details.
 * Users can view task details and add comments on shared tasks.
 */

import React, { useEffect, useState, useMemo } from 'react'
import { fetchSharedWithMe } from '../services/sharingService'
import { updateTask } from '../services/taskService'

const PRIORITY_BADGE = {
  HIGH:   'bg-red-100   text-red-700   border-red-200   dark:bg-red-950/40   dark:text-red-400   dark:border-red-800',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
  LOW:    'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800',
}

const STATUS_BADGE = {
  TODO:        'bg-amber-50   text-amber-700   border-amber-200   dark:bg-amber-950/40  dark:text-amber-400  dark:border-amber-800',
  IN_PROGRESS: 'bg-sky-50     text-sky-700     border-sky-200     dark:bg-sky-950/40    dark:text-sky-400    dark:border-sky-800',
  DONE:        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
}

const PERMISSION_BADGE = {
  VIEW: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  EDIT: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800',
}

export default function SharedTasksPage() {
  const [sharedTasks, setSharedTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [editingTask, setEditingTask] = useState(null)
  const [editForm, setEditForm] = useState({ status: '', priority: '' })

  useEffect(() => { loadSharedTasks() }, [])

  async function loadSharedTasks() {
    try {
      const data = await fetchSharedWithMe()
      setSharedTasks(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load shared tasks:', e)
      setSharedTasks([])
    } finally {
      setLoading(false)
    }
  }

  // ── Filtered tasks ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = sharedTasks
    if (filter !== 'ALL') {
      result = result.filter(t => t.permission === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.owner_name?.toLowerCase().includes(q)
      )
    }
    return result
  }, [sharedTasks, filter, search])

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total: sharedTasks.length,
    viewOnly: sharedTasks.filter(t => t.permission === 'VIEW').length,
    editable: sharedTasks.filter(t => t.permission === 'EDIT').length,
  }), [sharedTasks])

  // ── Edit handler (for EDIT permission tasks) ────────────────────────────────

  function openEdit(task) {
    setEditingTask(task)
    setEditForm({ status: task.status || 'TODO', priority: task.priority || 'MEDIUM' })
  }

  function closeEdit() {
    setEditingTask(null)
    setEditForm({ status: '', priority: '' })
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    if (!editingTask) return
    try {
      await updateTask(editingTask.task_id, editForm)
      // Refresh the list
      await loadSharedTasks()
      closeEdit()
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
          Shared with Me
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Tasks that collaborators have shared with you
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Shared', value: stats.total, color: 'border-indigo-300 dark:border-indigo-700' },
          { label: 'View Only', value: stats.viewOnly, color: 'border-gray-300 dark:border-gray-700' },
          { label: 'Can Edit', value: stats.editable, color: 'border-emerald-300 dark:border-emerald-700' },
        ].map(s => (
          <div key={s.label} className={`border-2 ${s.color} rounded-lg px-4 py-3`}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by title or owner..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
        />
        <div className="flex gap-1">
          {['ALL', 'VIEW', 'EDIT'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors
                ${filter === f
                  ? 'border-gray-900 dark:border-gray-400 bg-gray-900 dark:bg-gray-700 text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
            >
              {f === 'ALL' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">
            {sharedTasks.length === 0
              ? 'No tasks have been shared with you yet.'
              : 'No tasks match your filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <div
              key={task.task_id || task.id}
              className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-400 dark:hover:border-gray-500 transition-colors bg-white dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: task info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                      {task.title}
                    </h3>
                    {task.priority && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border rounded ${PRIORITY_BADGE[task.priority] || ''}`}>
                        {task.priority}
                      </span>
                    )}
                    {task.status && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border rounded ${STATUS_BADGE[task.status] || ''}`}>
                        {task.status?.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Shared by <span className="font-bold text-gray-600 dark:text-gray-300">{task.owner_name || 'Unknown'}</span>
                    </span>
                    {task.deadline && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                        Due: {task.deadline}
                      </span>
                    )}
                    {task.shared_at && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Shared: {new Date(task.shared_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: permission + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase border rounded ${PERMISSION_BADGE[task.permission] || PERMISSION_BADGE.VIEW}`}>
                    {task.permission}
                  </span>
                  {task.permission === 'EDIT' && (
                    <button
                      onClick={() => openEdit(task)}
                      className="px-2.5 py-1 text-xs font-bold border-2 border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeEdit}>
          <div
            className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 rounded-lg p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 mb-4">
              Edit Shared Task
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 truncate">
              {editingTask.title}
            </p>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DONE">Done</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                  Priority
                </label>
                <select
                  value={editForm.priority}
                  onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 text-sm font-bold border-2 border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold border-2 border-gray-900 dark:border-gray-400 rounded-lg bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
