/**
 * TasksPage — Project Board with drag-and-drop Kanban.
 *
 * New scheduling features:
 *   • Due time (HH:MM) — schedule tasks at a specific time of day
 *   • Recurrence — NONE | DAILY | WEEKDAYS | WEEKLY | MONTHLY
 *     Completing a recurring task auto-creates the next occurrence server-side.
 *   • Estimated duration — show time budget per task, used for overlap detection
 *   • Overlap detection — tasks on the same day whose time windows collide get
 *     a warning badge; no two tasks should own the same time slot.
 */

import React, { useEffect, useState, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  markTaskComplete,
} from '../services/taskService'
import { suggestCategories } from '../utils/smartCategories'

const COLUMNS = ['TODO', 'IN_PROGRESS', 'DONE']

const COLUMN_CONFIG = {
  TODO:        { label: 'To Do',       color: 'text-amber-500'   },
  IN_PROGRESS: { label: 'In Progress', color: 'text-sky-500'     },
  DONE:        { label: 'Done',        color: 'text-emerald-500' },
}

const CARD_COLORS = {
  TODO:        'bg-amber-50   border-amber-200   dark:bg-amber-950/40  dark:border-amber-800',
  IN_PROGRESS: 'bg-sky-50     border-sky-200     dark:bg-sky-950/40    dark:border-sky-800',
  DONE:        'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
}

const PRIORITY_BADGE = {
  HIGH:   'bg-red-100   text-red-700   border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW:    'bg-green-100 text-green-700 border-green-200',
}

const RECURRENCE_LABELS = {
  NONE:     'One-time',
  DAILY:    'Daily',
  WEEKDAYS: 'Weekdays',
  WEEKLY:   'Weekly',
  MONTHLY:  'Monthly',
}

const DURATION_PRESETS = [15, 25, 30, 45, 60, 90, 120]

// ── Overlap detection ─────────────────────────────────────────────────────────
// Strategy pattern — detectOverlaps is a pluggable strategy for conflict
// detection; swap it out without touching the board rendering logic.
// Factory      — openModal(task) acts as a factory: it builds the correct
//                form state for edit vs. create modes.
// Returns a Set of task IDs that have a time conflict with at least one other task.
function detectOverlaps(tasks) {
  const overlapping = new Set()
  const scheduled = tasks.filter(
    t => t.status !== 'DONE' && t.deadline && t.due_time && t.estimated_minutes
  )
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i]
      const b = scheduled[j]
      if (a.deadline !== b.deadline) continue
      const aStart = timeToMins(a.due_time)
      const aEnd   = aStart + a.estimated_minutes
      const bStart = timeToMins(b.due_time)
      const bEnd   = bStart + b.estimated_minutes
      if (aStart < bEnd && bStart < aEnd) {
        overlapping.add(a.id)
        overlapping.add(b.id)
      }
    }
  }
  return overlapping
}

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Compute the next occurrence date for a recurring task (mirrors backend logic). */
function nextRecurDate(deadlineStr, recurrence) {
  if (!deadlineStr || !recurrence || recurrence === 'NONE') return null
  const [y, mo, d] = deadlineStr.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  if (recurrence === 'DAILY') {
    date.setDate(date.getDate() + 1)
  } else if (recurrence === 'WEEKDAYS') {
    date.setDate(date.getDate() + 1)
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1)
  } else if (recurrence === 'WEEKLY') {
    date.setDate(date.getDate() + 7)
  } else if (recurrence === 'MONTHLY') {
    date.setMonth(date.getMonth() + 1)
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(d, last))
  } else {
    return null
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmt12h(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr12 = h % 12 || 12
  return `${hr12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [categoryInput, setCategoryInput] = useState('')
  const [formData, setFormData] = useState({
    title: '', description: '', priority: 'MEDIUM',
    deadline: '', due_time: '', recurrence: 'NONE',
    estimated_minutes: '', status: 'TODO', categories: [],
  })

  const [overlapError, setOverlapError] = useState('')

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchText,       setSearchText]       = useState('')
  const [filterPriority,   setFilterPriority]   = useState('ALL')
  const [filterDeadline,   setFilterDeadline]   = useState('ALL')
  const [filterStatus,     setFilterStatus]     = useState('ALL')
  const [filterRecurrence, setFilterRecurrence] = useState('ALL')

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    try {
      const data = await fetchTasks()
      setTasks(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load tasks:', e)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  // ── Analytics (computed client-side) ──────────────────────────────────────
  const analytics = useMemo(() => {
    const total     = tasks.length
    const by_status   = { TODO: 0, IN_PROGRESS: 0, DONE: 0 }
    const by_priority = { LOW: 0, MEDIUM: 0, HIGH: 0 }
    let overdue = 0
    const now = new Date()

    tasks.forEach(t => {
      by_status[t.status]     = (by_status[t.status]     || 0) + 1
      by_priority[t.priority] = (by_priority[t.priority] || 0) + 1
      if (t.deadline && t.status !== 'DONE') {
        const dl = t.due_time
          ? new Date(`${t.deadline}T${t.due_time}`)
          : new Date(t.deadline)
        if (dl < now) overdue++
      }
    })

    const completion_rate = total > 0 ? Math.round((by_status.DONE / total) * 100) : 0
    return { total, by_status, by_priority, overdue, completion_rate }
  }, [tasks])

  // ── Overlap detection ─────────────────────────────────────────────────────
  const overlappingIds = useMemo(() => detectOverlaps(tasks), [tasks])

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    const now        = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(todayStart.getTime() + 86_400_000)
    const weekEnd    = new Date(todayStart.getTime() + 7 * 86_400_000)

    return tasks.filter(t => {
      if (searchText) {
        const q = searchText.toLowerCase()
        if (!t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false
      }
      if (filterPriority   !== 'ALL' && t.priority  !== filterPriority)   return false
      if (filterStatus     !== 'ALL' && t.status    !== filterStatus)     return false
      if (filterRecurrence !== 'ALL') {
        const r = t.recurrence || 'NONE'
        if (filterRecurrence === 'RECURRING' && r === 'NONE') return false
        if (filterRecurrence !== 'RECURRING' && r !== filterRecurrence) return false
      }
      if (filterDeadline !== 'ALL') {
        if (!t.deadline) return false
        const dl = new Date(t.deadline)
        if (filterDeadline === 'OVERDUE'   && (dl >= todayStart || t.status === 'DONE')) return false
        if (filterDeadline === 'TODAY'     && (dl < todayStart  || dl >= todayEnd))      return false
        if (filterDeadline === 'THIS_WEEK' && (dl < todayStart  || dl >= weekEnd))       return false
      }
      return true
    })
  }, [tasks, searchText, filterPriority, filterStatus, filterDeadline, filterRecurrence])

  const hasFilters = !!searchText || filterPriority !== 'ALL' || filterStatus !== 'ALL' || filterDeadline !== 'ALL' || filterRecurrence !== 'ALL'

  const tasksByStatus = {
    TODO:        filteredTasks.filter(t => t.status === 'TODO'),
    IN_PROGRESS: filteredTasks.filter(t => t.status === 'IN_PROGRESS'),
    DONE:        filteredTasks.filter(t => t.status === 'DONE'),
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openModal(task = null, defaultStatus = 'TODO') {
    if (task) {
      setEditingTask(task)
      setFormData({
        title:             task.title,
        description:       task.description || '',
        priority:          task.priority,
        deadline:          task.deadline    || '',
        due_time:          task.due_time    || '',
        recurrence:        task.recurrence  || 'NONE',
        estimated_minutes: task.estimated_minutes ? String(task.estimated_minutes) : '',
        status:            task.status,
        categories:        task.categories || [],
      })
    } else {
      setEditingTask(null)
      setFormData({
        title: '', description: '', priority: 'MEDIUM',
        deadline: '', due_time: '', recurrence: 'NONE',
        estimated_minutes: '', status: defaultStatus, categories: [],
      })
    }
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingTask(null)
    setCategoryInput('')
    setOverlapError('')
  }

  function addCategory() {
    const cat = categoryInput.trim()
    if (cat && !formData.categories.includes(cat)) {
      setFormData(prev => ({ ...prev, categories: [...prev.categories, cat] }))
      setCategoryInput('')
    }
  }

  function removeCategory(cat) {
    setFormData(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setOverlapError('')

    const estMins = formData.estimated_minutes ? parseInt(formData.estimated_minutes) : null
    const dueTime = formData.due_time || null

    // Check for scheduling conflicts before saving
    if (formData.deadline && dueTime && estMins) {
      const newStart = timeToMins(dueTime)
      const newEnd   = newStart + estMins

      const conflict = tasks.find(t => {
        if (t.status === 'DONE') return false
        if (editingTask && t.id === editingTask.id) return false  // skip self
        if (t.deadline !== formData.deadline) return false
        if (!t.due_time || !t.estimated_minutes) return false

        const tStart = timeToMins(t.due_time)
        const tEnd   = tStart + t.estimated_minutes
        return newStart < tEnd && tStart < newEnd
      })

      if (conflict) {
        const [ch, cm] = conflict.due_time.split(':').map(Number)
        const conflictTime = `${ch % 12 || 12}:${String(cm).padStart(2,'0')} ${ch >= 12 ? 'PM' : 'AM'}`
        const conflictEnd  = ch * 60 + cm + conflict.estimated_minutes
        const endH = Math.floor(conflictEnd / 60) % 24
        const endM = conflictEnd % 60
        const conflictEndTime = `${endH % 12 || 12}:${String(endM).padStart(2,'0')} ${endH >= 12 ? 'PM' : 'AM'}`
        setOverlapError(
          `Time conflict with "${conflict.title}" (${conflictTime}–${conflictEndTime}). Please choose a different time slot.`
        )
        return
      }
    }

    const payload = { ...formData, estimated_minutes: estMins, due_time: dueTime }
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, payload)
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await createTask(payload)
        setTasks(prev => [created, ...prev])
      }
      closeModal()
    } catch (err) {
      console.error('Failed to save task:', err)
    }
  }

  async function handleDelete(taskId) {
    if (!confirm('Delete this task?')) return
    try {
      await deleteTask(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  async function handleComplete(taskId) {
    try {
      const updated = await markTaskComplete(taskId)
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      // Reload so recurring next-occurrence appears immediately
      loadTasks()
    } catch (err) {
      console.error('Failed to complete task:', err)
    }
  }

  async function onDragEnd(result) {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    const newStatus = destination.droppableId
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t))
    try {
      await updateTask(draggableId, { status: newStatus })
    } catch {
      setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: source.droppableId } : t))
    }
  }

  if (loading) {
    return (
      <div className="p-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-5 gap-4 mb-8">
          {[1,2,3,4,5].map(i => <div key={i} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg h-20 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-64 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-10 max-w-7xl mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">Project Board</h1>
          {overlappingIds.size > 0 && (
            <p className="text-xs font-bold text-amber-600 mt-1 flex items-center gap-1.5">
              <span>⚠</span>
              {overlappingIds.size} task{overlappingIds.size !== 1 ? 's' : ''} have scheduling conflicts
            </p>
          )}
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 border-2 border-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100
                     font-bold text-sm px-4 py-2 rounded-lg hover:bg-gray-900 dark:hover:bg-gray-100
                     hover:text-white dark:hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </div>

      {/* ── Analytics strip ───────────────────────────────────────────────── */}
      <div data-testid="analytics-strip" className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 rounded-lg px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">Total</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-0.5">To Do</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.by_status.TODO}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-500 mb-0.5">In Progress</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.by_status.IN_PROGRESS}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-0.5">Done</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.by_status.DONE}</p>
        </div>
        {analytics.overdue > 0 ? (
          <div className="bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 rounded-lg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-0.5">Overdue</p>
            <p className="text-2xl font-extrabold text-red-600 font-mono">{analytics.overdue}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">Done Rate</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.completion_rate}%</p>
          </div>
        )}
      </div>

      {/* ── Search + Filters ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 rounded-lg p-4 mb-6">
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Search tasks by title or description…"
            className="w-full pl-10 pr-10 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm
                       font-medium text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors" />
          {searchText && (
            <button onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Priority</span>
            <div className="flex gap-1">
              {['ALL','HIGH','MEDIUM','LOW'].map(p => (
                <button key={p} onClick={() => setFilterPriority(p)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                    filterPriority === p
                      ? 'border-gray-900 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}>
                  {p === 'ALL' ? 'All' : p[0] + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Deadline</span>
            <div className="flex gap-1">
              {[{v:'ALL',l:'All'},{v:'OVERDUE',l:'Overdue'},{v:'TODAY',l:'Today'},{v:'THIS_WEEK',l:'This Week'}].map(({v,l}) => (
                <button key={v} onClick={() => setFilterDeadline(v)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                    filterDeadline === v
                      ? 'border-gray-900 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Status</span>
            <div className="flex gap-1">
              {[{v:'ALL',l:'All'},{v:'TODO',l:'To Do'},{v:'IN_PROGRESS',l:'In Progress'},{v:'DONE',l:'Done'}].map(({v,l}) => (
                <button key={v} onClick={() => setFilterStatus(v)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                    filterStatus === v
                      ? 'border-gray-900 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Type</span>
            <div className="flex gap-1 flex-wrap">
              {[
                { v: 'ALL',       l: 'All' },
                { v: 'NONE',      l: 'One-time' },
                { v: 'RECURRING', l: '↻ Any Recurring' },
                { v: 'DAILY',     l: '↻ Daily' },
                { v: 'WEEKDAYS',  l: '↻ Weekdays' },
                { v: 'WEEKLY',    l: '↻ Weekly' },
                { v: 'MONTHLY',   l: '↻ Monthly' },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => setFilterRecurrence(v)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                    filterRecurrence === v
                      ? 'border-gray-900 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          {hasFilters && (
            <button
              aria-label="Clear all filters"
              onClick={() => { setSearchText(''); setFilterPriority('ALL'); setFilterDeadline('ALL'); setFilterStatus('ALL'); setFilterRecurrence('ALL') }}
              className="ml-auto text-xs font-bold text-red-500 hover:text-red-700 border-2 border-red-200 hover:border-red-400 px-3 py-1 rounded transition-colors">
              Clear All
            </button>
          )}
        </div>

        {hasFilters && (
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            Showing <span className="font-bold text-gray-900 dark:text-gray-100">{filteredTasks.length}</span> of {tasks.length} tasks
          </p>
        )}
      </div>

      {/* ── Kanban columns ────────────────────────────────────────────────── */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-3 gap-6">
          {COLUMNS.map(colStatus => {
            const config   = COLUMN_CONFIG[colStatus]
            const colTasks = tasksByStatus[colStatus]
            return (
              <div key={colStatus} className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-[300px]">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-gray-900 dark:text-gray-100">{config.label}</h2>
                    <span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      {colTasks.length}
                    </span>
                  </div>
                  <button onClick={() => openModal(null, colStatus)}
                    className="w-7 h-7 rounded-full border-2 border-gray-900 dark:border-gray-600 flex items-center
                               justify-center hover:bg-gray-900 dark:hover:bg-gray-100 hover:text-white dark:hover:text-gray-900 transition-colors text-gray-900 dark:text-gray-100">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <Droppable droppableId={colStatus}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`space-y-3 min-h-[100px] rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-gray-100/60' : ''
                      }`}>
                      {colTasks.map((task, index) => {
                        const isOverdue = task.deadline && task.status !== 'DONE' && (
                          task.due_time
                            ? new Date(`${task.deadline}T${task.due_time}`) < new Date()
                            : new Date(task.deadline) < new Date()
                        )
                        const hasOverlap  = overlappingIds.has(task.id)
                        const isRecurring = task.recurrence && task.recurrence !== 'NONE'
                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`border-2 rounded-lg p-4 group cursor-grab active:cursor-grabbing
                                  ${CARD_COLORS[colStatus]}
                                  ${hasOverlap ? 'ring-2 ring-amber-400' : ''}
                                  ${snapshot.isDragging ? 'shadow-lg rotate-1' : ''}`}
                              >
                                {/* Title + priority */}
                                <div className="flex justify-between items-start mb-2 gap-2">
                                  <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                    {hasOverlap && (
                                      <span title="Scheduling conflict" className="text-amber-500 text-xs shrink-0 mt-0.5">⚠</span>
                                    )}
                                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-snug truncate">{task.title}</h3>
                                  </div>
                                  <span className={`text-xs px-2 py-0.5 rounded border font-bold shrink-0 ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.MEDIUM}`}>
                                    {task.priority}
                                  </span>
                                </div>

                                {task.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{task.description}</p>
                                )}

                                {/* Scheduling metadata row */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  {/* Task type badge — always shown */}
                                  {isRecurring ? (
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded">
                                      ↻ {RECURRENCE_LABELS[task.recurrence]}
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded">
                                      One-time
                                    </span>
                                  )}
                                  {task.estimated_minutes && (
                                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                      {task.estimated_minutes}m
                                    </span>
                                  )}
                                  {task.categories && task.categories.map(cat => (
                                    <span key={cat} className="text-xs font-bold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                      {cat}
                                    </span>
                                  ))}
                                  {task.deadline && (
                                    <span className={`text-xs font-mono ml-auto shrink-0 ${isOverdue ? 'text-red-500 font-bold' : 'text-gray-400 dark:text-gray-300'}`}>
                                      {isOverdue && '⚠ '}
                                      {new Date(task.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      {task.due_time && ` · ${fmt12h(task.due_time)}`}
                                    </span>
                                  )}
                                </div>

                                {/* Overdue warning for recurring tasks still in TODO/IN_PROGRESS */}
                                {isRecurring && isOverdue && task.status !== 'DONE' && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded px-2 py-1">
                                    <span>⚠</span>
                                    <span>Past due — complete to schedule next {RECURRENCE_LABELS[task.recurrence].toLowerCase()} occurrence</span>
                                  </div>
                                )}

                                {/* Next occurrence info for completed recurring tasks */}
                                {isRecurring && task.status === 'DONE' && task.deadline && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800 rounded px-2 py-1">
                                    <span>↻</span>
                                    <span>Next occurrence: {nextRecurDate(task.deadline, task.recurrence) ?? '—'}</span>
                                  </div>
                                )}

                                {/* Hover actions */}
                                <div className="flex gap-3 mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700/60 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openModal(task)}
                                    className="text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Edit</button>
                                  {task.status !== 'DONE' && (
                                    <button onClick={() => handleComplete(task.id)}
                                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                                      {isRecurring ? 'Complete (↻ next)' : 'Complete'}
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(task.id)}
                                    className="text-xs font-bold text-red-500 hover:text-red-700">Delete</button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                      {colTasks.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-8 font-medium">No tasks</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* ── Create / Edit modal ───────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 mb-5">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="task-title" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Title</label>
                <input id="task-title" type="text" value={formData.title} required
                  onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors" />

                {/* Smart category suggestions — appear as user types */}
                {(() => {
                  const suggestions = suggestCategories(formData.title, formData.categories)
                  if (!suggestions.length) return null
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">✦ Suggested</span>
                      {suggestions.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setFormData(p => ({
                            ...p,
                            categories: p.categories.includes(cat) ? p.categories : [...p.categories, cat]
                          }))}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold
                                     border border-indigo-300 dark:border-indigo-700
                                     bg-indigo-50 dark:bg-indigo-950/50
                                     text-indigo-600 dark:text-indigo-400
                                     hover:bg-indigo-100 dark:hover:bg-indigo-900/50
                                     transition-colors"
                        >
                          + {cat}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Description</label>
                <textarea value={formData.description} rows={2}
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors resize-none" />
              </div>

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Priority</label>
                  <select value={formData.priority}
                    onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Status</label>
                  <select value={formData.status}
                    onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors">
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              </div>

              {/* Due Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Due Date</label>
                  <input type="date" value={formData.deadline}
                    onChange={e => { setFormData(p => ({ ...p, deadline: e.target.value })); setOverlapError('') }}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Due Time <span className="normal-case font-medium text-gray-400 dark:text-gray-500">(optional)</span></label>
                  <input type="time" value={formData.due_time}
                    onChange={e => { setFormData(p => ({ ...p, due_time: e.target.value })); setOverlapError('') }}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors" />
                </div>
              </div>

              {/* Repeat + Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Repeat</label>
                  <select value={formData.recurrence}
                    onChange={e => setFormData(p => ({ ...p, recurrence: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors">
                    <option value="NONE">One-time</option>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKDAYS">Weekdays (Mon–Fri)</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Duration</label>
                  <select value={formData.estimated_minutes}
                    onChange={e => setFormData(p => ({ ...p, estimated_minutes: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors">
                    <option value="">— none —</option>
                    {DURATION_PRESETS.map(d => (
                      <option key={d} value={d}>{d} min{d === 25 ? ' (1 🍅)' : d === 50 ? ' (2 🍅)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Recurrence hint */}
              {formData.recurrence !== 'NONE' && (
                <div className="flex items-start gap-2 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2">
                  <span className="text-indigo-500 text-sm mt-0.5">↻</span>
                  <p className="text-xs text-indigo-700 font-medium">
                    {formData.recurrence === 'DAILY'    && 'A new task will appear every day after you complete this one.'}
                    {formData.recurrence === 'WEEKDAYS' && 'A new task will appear every weekday (Mon–Fri) after completion.'}
                    {formData.recurrence === 'WEEKLY'   && 'A new task will appear every week after you complete this one.'}
                    {formData.recurrence === 'MONTHLY'  && 'A new task will appear every month after you complete this one.'}
                  </p>
                </div>
              )}

              {/* Categories */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Categories</label>

                <div className="flex gap-2 mb-2">
                  <input type="text" value={categoryInput}
                    onChange={e => setCategoryInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                    placeholder="Add category…"
                    className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors" />
                  <button type="button" onClick={addCategory}
                    className="px-4 py-2 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-bold text-sm hover:border-gray-900 dark:hover:border-gray-400 transition-colors">
                    Add
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {formData.categories.map(cat => (
                    <span key={cat} className="inline-flex items-center gap-1 border-2 border-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100 px-2 py-0.5 rounded text-xs font-bold">
                      {cat}
                      <button type="button" onClick={() => removeCategory(cat)} className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Overlap error */}
              {overlapError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2.5">
                  <span className="text-red-500 text-sm shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs font-semibold text-red-700">{overlapError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-bold text-sm rounded-lg hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
                  {editingTask ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
