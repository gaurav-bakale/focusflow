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
import CommentThread from '../components/CommentThread'

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
  const [expandedComments, setExpandedComments] = useState(null)

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
    <div className="p-8 max-w-6xl mx-auto page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight mb-1" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
          Shared with Me
        </h1>
        <p className="text-sm" style={{ color:'#767c74' }}>
          Tasks that collaborators have shared with you
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Shared', value: stats.total,    accent: '#6366f1' },
          { label: 'View Only',    value: stats.viewOnly, accent: '#aeb4aa' },
          { label: 'Can Edit',     value: stats.editable, accent: '#3a6758' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{ background:'#f3f4ee', borderLeft:`3px solid ${s.accent}` }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color:'#aeb4aa' }}>{s.label}</p>
            <p className="text-2xl font-extrabold font-mono" style={{ color: s.accent }}>{s.value}</p>
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
          className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
          style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#2e342d' }}
        />
        <div className="flex gap-1">
          {['ALL', 'VIEW', 'EDIT'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
              style={filter === f
                ? { background:'#3a6758', color:'#ffffff', border:'1.5px solid #3a6758' }
                : { background:'transparent', color:'#5b6159', border:'1.5px solid #dee4da' }}
            >
              {f === 'ALL' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <svg width="80" height="72" viewBox="0 0 80 72" fill="none">
            <rect x="10" y="8" width="60" height="54" rx="8" fill="#f3f4ee" stroke="#dee4da" strokeWidth="1.5"/>
            <path d="M10 20h60" stroke="#dee4da" strokeWidth="1.5"/>
            <circle cx="22" cy="14" r="3" fill="#dee4da"/>
            <circle cx="32" cy="14" r="3" fill="#dee4da"/>
            <rect x="20" y="30" width="40" height="6" rx="3" fill="#ecefe7"/>
            <rect x="20" y="42" width="28" height="6" rx="3" fill="#ecefe7"/>
            <circle cx="62" cy="56" r="10" fill="#ecefe7" stroke="#dee4da" strokeWidth="1.5"/>
            <path d="M58 56h8M62 52v8" stroke="#aeb4aa" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p className="text-sm font-semibold" style={{ color:'#5b6159' }}>
            {sharedTasks.length === 0 ? 'Nothing shared yet' : 'No matches'}
          </p>
          <p className="text-xs" style={{ color:'#aeb4aa' }}>
            {sharedTasks.length === 0
              ? 'Ask a teammate to share a task with you.'
              : 'Try a different filter or search term.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <div
              key={task.task_id || task.id}
              className="rounded-2xl p-4 transition-all"
              style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 2px 8px rgba(46,52,45,0.05)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(46,52,45,0.10)'; e.currentTarget.style.transform='translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(46,52,45,0.05)'; e.currentTarget.style.transform='translateY(0)' }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: task info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold truncate" style={{ color:'#2e342d' }}>
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
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color:'#767c74' }}>
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs" style={{ color:'#aeb4aa' }}>
                      Shared by <span className="font-semibold" style={{ color:'#5b6159' }}>{task.owner_name || 'Unknown'}</span>
                    </span>
                    {task.deadline && (
                      <span className="text-xs font-mono" style={{ color:'#aeb4aa' }}>
                        📅 {task.deadline}
                      </span>
                    )}
                    {task.shared_at && (
                      <span className="text-xs" style={{ color:'#aeb4aa' }}>
                        {new Date(task.shared_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: permission + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase border rounded ${PERMISSION_BADGE[task.permission] || PERMISSION_BADGE.VIEW}`}>
                    {task.permission}
                  </span>
                  <button
                    onClick={() => setExpandedComments(prev => prev === (task.task_id || task.id) ? null : (task.task_id || task.id))}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg transition-colors"
                    style={{ border:'1.5px solid #dee4da', color:'#5b6159', background:'transparent' }}
                  >
                    Comments
                  </button>
                  {task.permission === 'EDIT' && (
                    <button
                      onClick={() => openEdit(task)}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg text-white transition-colors"
                      style={{ background:'#3a6758' }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <CommentThread taskId={task.task_id || task.id} visible={expandedComments === (task.task_id || task.id)} />
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeEdit}>
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 8px 40px rgba(46,52,45,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold mb-1" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
              Edit Shared Task
            </h2>
            <p className="text-sm mb-4 truncate" style={{ color:'#767c74' }}>
              {editingTask.title}
            </p>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color:'#5b6159' }}>
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#2e342d' }}
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DONE">Done</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color:'#5b6159' }}>
                  Priority
                </label>
                <select
                  value={editForm.priority}
                  onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#2e342d' }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeEdit}
                  className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors"
                  style={{ border:'1.5px solid #dee4da', color:'#5b6159', background:'transparent' }}>
                  Cancel
                </button>
                <button type="submit"
                  className="px-4 py-2 text-sm font-bold rounded-xl text-white transition-colors"
                  style={{ background:'#3a6758' }}>
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
