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
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  markTaskComplete,
} from '../services/taskService'
import { fetchBlocks, createBlock, createBlocksBulk, aiSchedule } from '../services/otherServices'
import { shareTask, fetchTaskShares, revokeShare, fetchWorkspaces } from '../services/sharingService'
import { prioritizeTasks, breakdownTask } from '../services/otherServices'
import { findFreeSlot } from '../utils/smartSchedule'
import CommentThread from '../components/CommentThread'
import { useTimer } from '../context/TimerContext'
import { generateRecurringSlots } from '../utils/smartSchedule'
import { suggestCategories } from '../utils/smartCategories'

const COLUMNS = ['TODO', 'IN_PROGRESS', 'DONE']

const COLUMN_CONFIG = {
  TODO:        { label: 'To Do',       color: 'text-amber-500'   },
  IN_PROGRESS: { label: 'In Progress', color: 'text-sky-500'     },
  DONE:        { label: 'Done',        color: 'text-emerald-500' },
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
  const { focusMins, startFocus } = useTimer()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // ── AI Schedule panel ────────────────────────────────────────────────────
  const [scheduleOpen,   setScheduleOpen]   = useState(false)
  const [scheduleData,   setScheduleData]   = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleAdding, setScheduleAdding] = useState(false)
  const [scheduleAdded,  setScheduleAdded]  = useState(false)
  const [scheduleError,  setScheduleError]  = useState('')

  const [tasks, setTasks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [categoryInput, setCategoryInput] = useState('')
  const [formData, setFormData] = useState({
    title: '', description: '', priority: 'MEDIUM',
    deadline: '', due_time: '', recurrence: 'NONE',
    estimated_minutes: '', status: 'TODO', categories: [],
    workspace_id: '',
  })

  // ── Workspaces ────────────────────────────────────────────────────────────
  // List of workspaces the user belongs to, used for the in-modal selector
  // and the top-of-page filter tabs.
  const [workspaces, setWorkspaces]               = useState([])
  const [workspaceFilter, setWorkspaceFilter]     = useState('ALL')

  const [overlapError, setOverlapError] = useState('')

  // ── Share dialog state ───────────────────────────────────────────────────
  const [shareModal, setShareModal]       = useState(false)
  const [shareTaskId, setShareTaskId]     = useState(null)
  const [shareTaskTitle, setShareTaskTitle] = useState('')
  const [shareEmail, setShareEmail]       = useState('')
  const [sharePermission, setSharePermission] = useState('VIEW')
  const [shareError, setShareError]       = useState('')
  const [shareSuccess, setShareSuccess]   = useState('')
  const [shareLoading, setShareLoading]   = useState(false)
  const [existingShares, setExistingShares] = useState([])
  const [sharesLoading, setSharesLoading] = useState(false)

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchText,       setSearchText]       = useState('')
  const [filterPriority,   setFilterPriority]   = useState('ALL')
  const [filterDeadline,   setFilterDeadline]   = useState('ALL')
  const [filterStatus,     setFilterStatus]     = useState('ALL')
  const [filterRecurrence, setFilterRecurrence] = useState('ALL')

  // ── AI state ────────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')
  const [breakdownTaskId, setBreakdownTaskId]     = useState(null)
  const [breakdownResult, setBreakdownResult]     = useState([])
  const [breakdownLoading, setBreakdownLoading]   = useState(false)
  const [subtaskInput, setSubtaskInput]           = useState('')

  useEffect(() => { loadTasks(); loadWorkspaces() }, [])

  // Honour ?workspace=<id> deep-link from WorkspacesPage — pre-select the
  // workspace filter on mount.
  useEffect(() => {
    const ws = searchParams.get('workspace')
    if (ws) setWorkspaceFilter(ws)
  }, [searchParams])

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

  async function loadWorkspaces() {
    try {
      const data = await fetchWorkspaces()
      setWorkspaces(Array.isArray(data) ? data : [])
    } catch (e) {
      // Non-critical — workspaces are optional. Swallow to keep personal tasks working.
      console.error('Failed to load workspaces:', e)
      setWorkspaces([])
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
      if (workspaceFilter  === 'PERSONAL' && t.workspace_id)              return false
      if (workspaceFilter !== 'ALL' && workspaceFilter !== 'PERSONAL'
          && t.workspace_id !== workspaceFilter)                           return false
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
  }, [tasks, searchText, filterPriority, filterStatus, filterDeadline, filterRecurrence, workspaceFilter])

  const hasFilters = !!searchText || filterPriority !== 'ALL' || filterStatus !== 'ALL' || filterDeadline !== 'ALL' || filterRecurrence !== 'ALL' || workspaceFilter !== 'ALL'

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
        subtasks:          (task.subtasks || []).map(s => ({ title: s.title, status: s.status })),
        workspace_id:      task.workspace_id || '',
      })
    } else {
      // Default new tasks to the currently selected workspace filter, so
      // creating a task while "CSYE 7230" is the active filter lands it there.
      const defaultWs = (workspaceFilter !== 'ALL' && workspaceFilter !== 'PERSONAL')
        ? workspaceFilter
        : ''
      setEditingTask(null)
      setFormData({
        title: '', description: '', priority: 'MEDIUM',
        deadline: '', due_time: '', recurrence: 'NONE',
        estimated_minutes: '', status: defaultStatus, categories: [],
        subtasks: [],
        workspace_id: defaultWs,
      })
    }
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingTask(null)
    setCategoryInput('')
    setSubtaskInput('')
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
    // Only include subtasks if editing (new tasks start with no subtasks)
    if (!editingTask) delete payload.subtasks
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, payload)
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await createTask(payload)
        setTasks(prev => [created, ...prev])

        // Auto-schedule: generate blocks for all occurrences within the rolling
        // window and create them in bulk. Non-critical — task is already saved.
        if (created.deadline) {
          try {
            const blocks  = await fetchBlocks()
            const groupId = created.recurrence && created.recurrence !== 'NONE'
              ? `${created.id}-${created.deadline}`
              : null
            const slots = generateRecurringSlots(created, focusMins, blocks, groupId)
            if (slots.length === 1) {
              await createBlock(slots[0])
            } else if (slots.length > 1) {
              await createBlocksBulk(slots)
            }
          } catch (_) { /* auto-schedule failure is non-critical */ }
        }
      }
      closeModal()
    } catch (err) {
      console.error('Failed to save task:', err)
    }
  }

  async function handleAISchedule() {
    const todoTasks = tasks.filter(t => t.status === 'TODO' || t.status === 'IN_PROGRESS')
    if (!todoTasks.length) return
    setScheduleLoading(true)
    setScheduleError('')
    setScheduleData(null)
    setScheduleAdded(false)
    try {
      const payload = todoTasks.map(t => ({
        id: t.id, title: t.title, priority: t.priority,
        deadline: t.deadline || null, status: t.status,
        estimated_minutes: t.estimated_minutes || focusMins,
      }))
      const res = await aiSchedule(payload)
      setScheduleData(res)
    } catch (err) {
      setScheduleError(err.response?.data?.detail || 'AI schedule failed. Make sure your Gemini API key is set in Settings.')
    }
    setScheduleLoading(false)
  }

  async function handleAddScheduleToCalendar() {
    if (!scheduleData?.schedule?.length) return
    setScheduleAdding(true)
    setScheduleError('')
    try {
      const existingBlocks = await fetchBlocks()

      // Task IDs that already have a calendar block — skip them to prevent duplicates
      const scheduledTaskIds = new Set(existingBlocks.map(b => b.task_id).filter(Boolean))

      // Only match TODO / IN_PROGRESS tasks — skip AI placeholders like "Lunch Break"
      const eligible = tasks.filter(
        t => (t.status === 'TODO' || t.status === 'IN_PROGRESS') && !scheduledTaskIds.has(t.id)
      )
      const titleToTask = {}
      eligible.forEach(t => { titleToTask[t.title.toLowerCase().trim()] = t })

      const orderedTasks = scheduleData.schedule
        .map(b => titleToTask[b.task_title?.toLowerCase().trim()])
        .filter(Boolean)

      if (!orderedTasks.length) {
        setScheduleError('No matching TODO / In Progress tasks found in the schedule.')
        setScheduleAdding(false)
        return
      }

      const GAP_MINS = 30
      const newBlocks  = []
      const allBlocks  = [...existingBlocks] // grows so each slot-search sees prior placements

      // Parse a local datetime string ("YYYY-MM-DDTHH:MM") safely as local time
      const parseLocal = (str) => {
        const [datePart, timePart = '00:00'] = str.split('T')
        const [y, mo, d] = datePart.split('-').map(Number)
        const [h = 0, mi = 0] = timePart.split(':').map(Number)
        return new Date(y, mo - 1, d, h, mi)
      }
      const toLocalStr = (dt) => {
        const p = n => String(n).padStart(2, '0')
        return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`
      }
      const dateStr = (dt) => {
        const p = n => String(n).padStart(2, '0')
        return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}`
      }

      // Start cursor at next 30-min boundary from now
      const now = new Date()
      let cursor = new Date(Math.ceil(now.getTime() / (GAP_MINS * 60000)) * (GAP_MINS * 60000))

      const priorityColor = { HIGH: '#ef4444', MEDIUM: '#6366f1', LOW: '#10b981' }

      for (let i = 0; i < orderedTasks.length; i++) {
        const task = orderedTasks[i]
        const durationMins = task.estimated_minutes || (2 * focusMins)

        // Try today first, then up to 6 more days
        let slot = null
        let tryDate = new Date(cursor)

        for (let day = 0; day < 7; day++) {
          slot = findFreeSlot(dateStr(tryDate), durationMins, allBlocks, null, tryDate)
          if (slot) break
          // Day is full — try next day at 6 AM
          tryDate = new Date(tryDate.getFullYear(), tryDate.getMonth(), tryDate.getDate() + 1, 6, 0)
        }

        if (!slot) continue

        // Task block
        const taskBlock = {
          title:      task.title,
          start_time: slot.start_time,
          end_time:   slot.end_time,
          task_id:    task.id,
          color:      priorityColor[task.priority] || '#6366f1',
        }
        newBlocks.push(taskBlock)
        allBlocks.push({ start_time: slot.start_time, end_time: slot.end_time })

        // 30-min Rest / Free block after each task (except the last)
        if (i < orderedTasks.length - 1) {
          const restStart = parseLocal(slot.end_time)
          const restEnd   = new Date(restStart.getTime() + GAP_MINS * 60000)
          const restBlock = {
            title:      'Rest / Free',
            start_time: toLocalStr(restStart),
            end_time:   toLocalStr(restEnd),
            task_id:    null,
            color:      '#94a3b8',
          }
          newBlocks.push(restBlock)
          allBlocks.push({ start_time: restBlock.start_time, end_time: restBlock.end_time })
          cursor = restEnd
        }
      }

      if (newBlocks.length) await createBlocksBulk(newBlocks)
      setScheduleAdded(true)
    } catch (err) {
      setScheduleError(err.response?.data?.detail || 'Failed to add to calendar.')
    }
    setScheduleAdding(false)
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
      const result = await markTaskComplete(taskId)
      // result = { completed, next_task }
      const completed = result?.completed ?? result
      setTasks(prev => prev.map(t => t.id === completed.id ? completed : t))

      // If recurring, add the new next-occurrence task to the board and
      // auto-schedule a calendar block for it silently.
      const nextTask = result?.next_task
      if (nextTask) {
        setTasks(prev => [nextTask, ...prev])
        if (nextTask.deadline) {
          try {
            const existingBlocks = await fetchBlocks()
            const groupId = `${nextTask.id}-${nextTask.deadline}`
            const slots = generateRecurringSlots(nextTask, focusMins, existingBlocks, groupId)
            if (slots.length === 1) {
              await createBlock(slots[0])
            } else if (slots.length > 1) {
              await createBlocksBulk(slots)
            }
          } catch (_) { /* non-critical */ }
        }
      } else {
        // Non-recurring — reload to get clean state
        loadTasks()
      }
    } catch (err) {
      console.error('Failed to complete task:', err)
    }
  }

  // ── Share dialog handlers ─────────────────────────────────────────────────

  async function openShareModal(task) {
    setShareTaskId(task.id)
    setShareTaskTitle(task.title)
    setShareEmail('')
    setSharePermission('VIEW')
    setShareError('')
    setShareSuccess('')
    setShareModal(true)
    // Load existing shares
    setSharesLoading(true)
    try {
      const shares = await fetchTaskShares(task.id)
      setExistingShares(Array.isArray(shares) ? shares : [])
    } catch (_) {
      setExistingShares([])
    } finally {
      setSharesLoading(false)
    }
  }

  function closeShareModal() {
    setShareModal(false)
    setShareTaskId(null)
    setShareTaskTitle('')
    setShareEmail('')
    setShareError('')
    setShareSuccess('')
    setExistingShares([])
  }

  async function handleShare(e) {
    e.preventDefault()
    if (!shareEmail.trim()) return
    setShareLoading(true)
    setShareError('')
    setShareSuccess('')
    try {
      await shareTask({
        task_id: shareTaskId,
        email: shareEmail.trim(),
        permission: sharePermission,
      })
      setShareSuccess(`Shared with ${shareEmail}`)
      setShareEmail('')
      // Refresh shares list
      const shares = await fetchTaskShares(shareTaskId)
      setExistingShares(Array.isArray(shares) ? shares : [])
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to share task'
      setShareError(msg)
    } finally {
      setShareLoading(false)
    }
  }

  async function handleRevoke(shareId) {
    try {
      await revokeShare(shareId)
      setExistingShares(prev => prev.filter(s => s.id !== shareId))
    } catch (err) {
      console.error('Failed to revoke share:', err)
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

  // ── AI Prioritize handler ─────────────────────────────────────────────
  async function handleAIPrioritize() {
    const incomplete = tasks.filter(t => t.status !== 'DONE')
    if (incomplete.length === 0) { setAiError('No incomplete tasks to prioritize.'); return }
    setAiLoading(true)
    setAiError('')
    try {
      const payload = incomplete.map(t => ({
        id: t.id, title: t.title, description: t.description || '',
        priority: t.priority, deadline: t.deadline || null, status: t.status,
      }))
      const res = await prioritizeTasks(payload)
      const ordered = res.prioritized_tasks || []
      // Map AI-returned priorities back onto local tasks
      const updates = {}
      ordered.forEach(item => {
        if (item.id && item.priority) updates[item.id] = item.priority
      })
      setTasks(prev => prev.map(t => updates[t.id] ? { ...t, priority: updates[t.id] } : t))
    } catch (err) {
      const msg = err.response?.data?.detail || 'AI prioritization failed. Check your Gemini API key in settings.'
      setAiError(msg)
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI Breakdown handler ─────────────────────────────────────────────
  async function handleBreakdown(task) {
    if (breakdownTaskId === task.id) {
      // Toggle off
      setBreakdownTaskId(null)
      setBreakdownResult([])
      return
    }
    setBreakdownTaskId(task.id)
    setBreakdownResult([])
    setBreakdownLoading(true)
    try {
      const res = await breakdownTask(task.id, task.title, task.description || '')
      setBreakdownResult(res.subtasks || [])
    } catch (err) {
      const msg = err.response?.data?.detail || 'AI breakdown failed.'
      setAiError(msg)
      setBreakdownTaskId(null)
    } finally {
      setBreakdownLoading(false)
    }
  }

  // ── Subtask handlers ─────────────────────────────────────────────────
  async function handleToggleSubtask(task, subtaskId) {
    const updatedSubtasks = (task.subtasks || []).map(s =>
      s.id === subtaskId ? { ...s, status: s.status === 'DONE' ? 'TODO' : 'DONE' } : s
    )
    try {
      const updated = await updateTask(task.id, {
        subtasks: updatedSubtasks.map(s => ({ title: s.title, status: s.status })),
      })
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch (err) { console.error('Failed to toggle subtask:', err) }
  }

  async function handleDeleteSubtask(task, subtaskId) {
    const filtered = (task.subtasks || [])
      .filter(s => s.id !== subtaskId)
      .map(s => ({ title: s.title, status: s.status }))
    try {
      const updated = await updateTask(task.id, { subtasks: filtered })
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch (err) { console.error('Failed to delete subtask:', err) }
  }

  async function handleSaveBreakdownAsSubtasks(task) {
    const current = (task.subtasks || []).map(s => ({ title: s.title, status: s.status }))
    const newSubs = breakdownResult.map(title => ({ title, status: 'TODO' }))
    try {
      const updated = await updateTask(task.id, { subtasks: [...current, ...newSubs] })
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      setBreakdownTaskId(null)
      setBreakdownResult([])
    } catch (err) { console.error('Failed to save breakdown:', err) }
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
    <div className="p-10 max-w-7xl mx-auto" style={{ background: '#fafaf5', minHeight: '100%' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 900, color: '#3a6758' }}>Project Board</h1>
          {overlappingIds.size > 0 && (
            <p className="text-xs font-bold text-amber-600 mt-1 flex items-center gap-1.5">
              <span>⚠</span>
              {overlappingIds.size} task{overlappingIds.size !== 1 ? 's' : ''} have scheduling conflicts
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAIPrioritize}
            disabled={aiLoading}
            className={`flex items-center gap-2 border-2 font-bold text-sm px-4 py-2 rounded-lg transition-colors ${
              aiLoading
                ? 'border-purple-300 text-purple-300 cursor-wait'
                : 'border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {aiLoading ? 'Prioritizing…' : 'AI Prioritize'}
          </button>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 font-bold text-sm px-4 py-2 rounded-xl transition-colors"
            style={{ background: '#3a6758', color: '#ffffff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        </div>
      </div>

      {/* ── Analytics strip ───────────────────────────────────────────────── */}
      <div data-testid="analytics-strip" className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg px-4 py-3" style={{ border: '1px solid #dee4da' }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">Total</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg px-4 py-3" style={{ border: '1px solid #dee4da' }}>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-0.5">To Do</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.by_status.TODO}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg px-4 py-3" style={{ border: '1px solid #dee4da' }}>
          <p className="text-xs font-bold uppercase tracking-widest text-sky-500 mb-0.5">In Progress</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.by_status.IN_PROGRESS}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg px-4 py-3" style={{ border: '1px solid #dee4da' }}>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-0.5">Done</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.by_status.DONE}</p>
        </div>
        {analytics.overdue > 0 ? (
          <div className="bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 rounded-lg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-0.5">Overdue</p>
            <p className="text-2xl font-extrabold text-red-600 font-mono">{analytics.overdue}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg px-4 py-3" style={{ border: '1px solid #dee4da' }}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">Done Rate</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{analytics.completion_rate}%</p>
          </div>
        )}
      </div>

      {/* ── AI Error banner ─────────────────────────────────────────────── */}
      {aiError && (
        <div className="mb-4 flex items-center justify-between bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">{aiError}</p>
          <button onClick={() => setAiError('')} className="text-red-400 hover:text-red-700 dark:hover:text-red-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Search + Filters ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-6" style={{ border: '1px solid #dee4da' }}>
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Search tasks by title or description…"
            className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm
                       font-medium text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600
                       text-gray-900 dark:text-gray-100
                       focus:ring-0 outline-none transition-colors"
            style={{ background: '#f3f4ee', border: '1px solid #dee4da' }} />
          {searchText && (
            <button onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Workspace scope — shown only when the user has at least one workspace. */}
        {workspaces.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Workspace</span>
            <div className="flex gap-1 flex-wrap">
              {[
                { v: 'ALL',      l: 'All' },
                { v: 'PERSONAL', l: 'Personal' },
                ...workspaces.map(w => ({ v: w.id, l: w.name })),
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setWorkspaceFilter(v)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                    workspaceFilter === v
                      ? 'border-gray-900 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

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
              onClick={() => { setSearchText(''); setFilterPriority('ALL'); setFilterDeadline('ALL'); setFilterStatus('ALL'); setFilterRecurrence('ALL'); setWorkspaceFilter('ALL') }}
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

      {/* ── AI Schedule bar ──────────────────────────────────────────────── */}
      <div className="mb-4 rounded-2xl overflow-hidden" style={{ background: '#ecefe7', border: '1px solid #dee4da' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold" style={{ color: '#3a6758' }}>📅 AI Schedule</span>
            <span className="text-xs" style={{ color: '#5b6159' }}>Auto-plan your tasks for today</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setScheduleOpen(o => !o); if (!scheduleOpen && !scheduleData) handleAISchedule() }}
              disabled={scheduleLoading || tasks.filter(t => t.status !== 'DONE').length === 0}
              className="px-4 py-1.5 text-xs font-bold rounded-xl disabled:opacity-40 transition-colors"
              style={{ background: '#3a6758', color: '#ffffff' }}
            >
              {scheduleLoading ? 'Planning…' : scheduleOpen ? 'Hide' : 'Plan My Day'}
            </button>
          </div>
        </div>

        {scheduleOpen && (
          <div className="px-4 py-4 bg-white dark:bg-gray-900 border-t" style={{ borderColor: '#dee4da' }}>
            {scheduleError && (
              <p className="text-xs text-red-500 font-medium mb-3">{scheduleError}</p>
            )}
            {scheduleLoading && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3a6758', borderTopColor: 'transparent' }} />
                <span className="text-xs text-gray-400">AI is building your schedule…</span>
              </div>
            )}
            {scheduleData && !scheduleLoading && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{scheduleData.summary}</p>
                <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-3 lg:grid-cols-4">
                  {(scheduleData.schedule || []).map((block, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: '#ecefe7', border: '1px solid #dee4da' }}>
                      <span className="text-xs font-mono font-bold shrink-0 mt-0.5" style={{ color: '#3a6758' }}>{block.time}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{block.task_title}</p>
                        <p className="text-xs text-gray-400">{block.duration_minutes}min</p>
                      </div>
                    </div>
                  ))}
                </div>
                {scheduleAdded ? (
                  <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Added to calendar — no conflicts!</span>
                    </div>
                    <button onClick={() => navigate('/calendar')} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 underline">
                      View Calendar →
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddScheduleToCalendar}
                      disabled={scheduleAdding}
                      className="px-4 py-2 font-bold text-xs rounded-xl disabled:opacity-50 transition-colors"
                      style={{ background: '#3a6758', color: '#ffffff' }}
                    >
                      {scheduleAdding ? 'Adding…' : '📅 Add to Calendar'}
                    </button>
                    <button
                      onClick={() => { setScheduleData(null); setScheduleAdded(false); handleAISchedule() }}
                      className="px-4 py-2 font-bold text-xs rounded-xl hover:opacity-80 transition-colors"
                      style={{ background: '#ecefe7', color: '#5b6159', border: '1px solid #dee4da' }}
                    >
                      Regenerate
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Kanban columns ────────────────────────────────────────────────── */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-3 gap-6">
          {COLUMNS.map(colStatus => {
            const config   = COLUMN_CONFIG[colStatus]
            const colTasks = tasksByStatus[colStatus]
            const colStripColor = colStatus === 'TODO' ? '#aeb4aa' : colStatus === 'IN_PROGRESS' ? '#3a6758' : '#10b981'
            return (
              <div key={colStatus} className="rounded-2xl p-4 min-h-[300px]" style={{ background: '#f3f4ee', boxShadow: '0 4px 12px rgba(46,52,45,0.04)' }}>
                {/* Thin color strip at top of column */}
                <div className="h-1 rounded-full mb-4 -mx-4 -mt-4 rounded-t-2xl" style={{ background: colStripColor }} />
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-gray-900 dark:text-gray-100">{config.label}</h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#dee4da', color: '#5b6159' }}>
                      {colTasks.length}
                    </span>
                  </div>
                  <button onClick={() => openModal(null, colStatus)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ border: '1px solid #dee4da', background: '#ffffff', color: '#3a6758' }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <Droppable droppableId={colStatus}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className="space-y-3 min-h-[100px] rounded-lg transition-colors"
                      style={snapshot.isDraggingOver ? { background: '#ecefe7', outline: '2px dashed #3a6758' } : {}}>
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
                                className={`rounded-2xl p-4 group cursor-grab active:cursor-grabbing
                                  ${hasOverlap ? 'ring-2 ring-amber-400' : ''}
                                  ${snapshot.isDragging ? 'shadow-lg rotate-1' : ''}`}
                                style={{ background: '#ffffff', boxShadow: '0 2px 8px rgba(46,52,45,0.05)' }}
                              >
                                {/* Title + priority */}
                                <div className="flex justify-between items-start mb-2 gap-2">
                                  <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                    {hasOverlap && (
                                      <span title="Scheduling conflict" className="text-amber-500 text-xs shrink-0 mt-0.5">⚠</span>
                                    )}
                                    <h3 className="font-bold text-sm leading-snug truncate" style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 700, color: '#2e342d' }}>{task.title}</h3>
                                  </div>
                                  <span className={`text-xs px-2 py-0.5 rounded border font-bold shrink-0 ${
                                    task.priority === 'HIGH'
                                      ? ''
                                      : task.priority === 'MEDIUM'
                                      ? ''
                                      : ''
                                  }`}
                                    style={
                                      task.priority === 'HIGH'
                                        ? { background: '#fee2e2', color: '#9f403d' }
                                        : task.priority === 'MEDIUM'
                                        ? { background: '#fef3c7', color: '#92400e' }
                                        : { background: '#ecefe7', color: '#5b6159' }
                                    }
                                  >
                                    {task.priority}
                                  </span>
                                </div>

                                {task.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{task.description}</p>
                                )}

                                {/* Subtask progress + list */}
                                {task.subtasks && task.subtasks.length > 0 && (() => {
                                  const total = task.subtasks.length
                                  const done = task.subtasks.filter(s => s.status === 'DONE').length
                                  const pct = Math.round((done / total) * 100)
                                  return (
                                    <div className="mb-2">
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400 dark:text-gray-500 shrink-0">{done}/{total}</span>
                                      </div>
                                      <ul className="space-y-0.5">
                                        {task.subtasks.map(sub => (
                                          <li key={sub.id} className="flex items-center gap-1.5 group/sub">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleToggleSubtask(task, sub.id) }}
                                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                sub.status === 'DONE'
                                                  ? 'bg-emerald-500 border-emerald-500'
                                                  : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400'
                                              }`}
                                            >
                                              {sub.status === 'DONE' && (
                                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                            </button>
                                            <span className={`text-xs flex-1 truncate ${sub.status === 'DONE' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
                                              {sub.title}
                                            </span>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleDeleteSubtask(task, sub.id) }}
                                              className="text-gray-300 dark:text-gray-600 hover:text-red-500 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0"
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )
                                })()}

                                {/* Scheduling metadata row */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  {/* Workspace badge — shown when task belongs to a workspace */}
                                  {task.workspace_id && (
                                    <span
                                      title={`Workspace · ${task.workspace_name || 'Team'}`}
                                      className="text-xs font-bold px-1.5 py-0.5 rounded border"
                                      style={{ color: '#1e40af', background: '#dbeafe', border: '1px solid #bfdbfe' }}
                                    >
                                      👥 {task.workspace_name || 'Team'}
                                    </span>
                                  )}
                                  {/* Task type badge — always shown */}
                                  {isRecurring ? (
                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#3a6758', background: '#ecefe7', border: '1px solid #dee4da' }}>
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
                                  {(() => {
                                    const saved = task.categories || []
                                    const display = saved.length > 0
                                      ? { cats: saved, inferred: false }
                                      : { cats: suggestCategories(task.title, [], 3), inferred: true }
                                    return display.cats.map(cat => (
                                      <span key={cat}
                                        title={display.inferred ? 'Auto-suggested (not saved)' : undefined}
                                        className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                          display.inferred
                                            ? 'opacity-70'
                                            : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                                        }`}
                                        style={display.inferred ? { background: '#ecefe7', border: '1px solid #dee4da', color: '#3a6758' } : {}}
                                      >
                                        {cat}
                                      </span>
                                    ))
                                  })()}
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
                                  <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold rounded px-2 py-1" style={{ color: '#3a6758', background: '#ecefe7', border: '1px solid #dee4da' }}>
                                    <span>↻</span>
                                    <span>Next occurrence: {nextRecurDate(task.deadline, task.recurrence) ?? '—'}</span>
                                  </div>
                                )}

                                {/* Pomodoro CTA — always visible on IN_PROGRESS cards */}
                                {task.status === 'IN_PROGRESS' && (
                                  <div className="mt-3">
                                    <button
                                      onClick={() => { startFocus(task.id); navigate('/timer') }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs hover:opacity-90 active:scale-95 transition-all duration-150 shadow-sm"
                                      style={{ background: '#3a6758', color: '#ffffff' }}
                                    >
                                      <span className="animate-pulse">🍅</span>
                                      Start Pomodoro
                                    </button>
                                  </div>
                                )}

                                {/* Hover actions */}
                                <div className="flex gap-3 mt-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/60 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                                  <button onClick={() => openModal(task)}
                                    className="text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Edit</button>
                                  {task.status !== 'DONE' && (
                                    <button onClick={() => handleComplete(task.id)}
                                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                                      {isRecurring ? 'Complete (↻ next)' : 'Complete'}
                                    </button>
                                  )}
                                  <button onClick={() => handleBreakdown(task)}
                                    disabled={breakdownLoading && breakdownTaskId === task.id}
                                    className={`text-xs font-bold ${breakdownTaskId === task.id ? 'text-purple-600' : 'text-purple-500 hover:text-purple-700'}`}>
                                    {breakdownLoading && breakdownTaskId === task.id ? 'Loading…' : breakdownTaskId === task.id ? 'Hide AI' : 'AI Breakdown'}
                                  </button>
                                  <button onClick={() => openShareModal(task)}
                                    className="text-xs font-bold text-[#3a6758] hover:opacity-70">Share</button>
                                  <button onClick={() => handleDelete(task.id)}
                                    className="text-xs font-bold text-red-500 hover:text-red-700">Delete</button>
                                </div>

                                {/* AI Breakdown results */}
                                {breakdownTaskId === task.id && breakdownResult.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-xs font-bold text-purple-600 dark:text-purple-400">AI-Suggested Subtasks</p>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleSaveBreakdownAsSubtasks(task) }}
                                        className="text-xs font-bold text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                                      >
                                        Save as Subtasks
                                      </button>
                                    </div>
                                    <ul className="space-y-1">
                                      {breakdownResult.map((sub, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                                          <span className="text-purple-400 mt-0.5 shrink-0">-</span>
                                          <span>{sub}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
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
          <div className="rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ background: '#ffffff', boxShadow: '0 20px 50px rgba(46,52,45,0.12)' }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 mb-5">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="task-title" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Title</label>
                <input id="task-title" type="text" value={formData.title} required
                  onChange={e => {
                    const newTitle = e.target.value
                    setFormData(p => {
                      // Auto-apply suggestions for new tasks only
                      // Keep manually-added categories when editing
                      const suggested = suggestCategories(newTitle)
                      const next = editingTask
                        ? { ...p, title: newTitle }
                        : { ...p, title: newTitle, categories: suggested }
                      return next
                    })
                  }}
                  className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                  style={{ background: '#f3f4ee', border: '1px solid #dee4da' }} />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Description</label>
                <textarea value={formData.description} rows={2}
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors resize-none"
                  style={{ background: '#f3f4ee', border: '1px solid #dee4da' }} />
              </div>

              {/* Workspace — select Personal or any workspace the user belongs to */}
              {workspaces.length > 0 && (
                <div>
                  <label htmlFor="task-workspace" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                    Workspace
                    <span className="normal-case font-medium text-gray-400 dark:text-gray-500 ml-2">
                      — who can see this task
                    </span>
                  </label>
                  <select
                    id="task-workspace"
                    value={formData.workspace_id || ''}
                    onChange={e => setFormData(p => ({ ...p, workspace_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}
                  >
                    <option value="">Personal — only you can see this</option>
                    {workspaces.map(w => (
                      <option key={w.id} value={w.id}>
                        👥 {w.name} — shared with all members
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Priority</label>
                  <select value={formData.priority}
                    onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Status</label>
                  <select value={formData.status}
                    onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}>
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
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Due Time <span className="normal-case font-medium text-gray-400 dark:text-gray-500">(optional)</span></label>
                  <input type="time" value={formData.due_time}
                    onChange={e => { setFormData(p => ({ ...p, due_time: e.target.value })); setOverlapError('') }}
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }} />
                </div>
              </div>

              {/* Repeat + Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Repeat</label>
                  <select value={formData.recurrence}
                    onChange={e => setFormData(p => ({ ...p, recurrence: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}>
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
                    className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}>
                    <option value="">— none —</option>
                    {DURATION_PRESETS.map(d => (
                      <option key={d} value={d}>{d} min{d === 25 ? ' (1 🍅)' : d === 50 ? ' (2 🍅)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Recurrence hint */}
              {formData.recurrence !== 'NONE' && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: '#ecefe7', border: '1px solid #dee4da' }}>
                  <span className="text-sm mt-0.5" style={{ color: '#3a6758' }}>↻</span>
                  <p className="text-xs font-medium" style={{ color: '#3a6758' }}>
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
                    className="flex-1 px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors"
                    style={{ background: '#f3f4ee', border: '1px solid #dee4da' }} />
                  <button type="button" onClick={addCategory}
                    className="px-4 py-2 rounded-xl font-bold text-sm transition-colors"
                    style={{ background: '#ecefe7', color: '#5b6159' }}>
                    Add
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {formData.categories.map(cat => (
                    <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold" style={{ border: '1px solid #dee4da', background: '#ecefe7', color: '#5b6159' }}>
                      {cat}
                      <button type="button" onClick={() => removeCategory(cat)} className="ml-0.5 hover:opacity-60">×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Subtasks (edit mode only) */}
              {editingTask && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                    Subtasks
                    {formData.subtasks && formData.subtasks.length > 0 && (
                      <span className="ml-2 normal-case font-medium text-gray-400 dark:text-gray-500">
                        {formData.subtasks.filter(s => s.status === 'DONE').length}/{formData.subtasks.length} done
                      </span>
                    )}
                  </label>

                  {/* Existing subtasks */}
                  {formData.subtasks && formData.subtasks.length > 0 && (
                    <ul className="space-y-1 mb-2">
                      {formData.subtasks.map((sub, i) => (
                        <li key={i} className="flex items-center gap-2 group/msub">
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                subtasks: prev.subtasks.map((s, j) =>
                                  j === i ? { ...s, status: s.status === 'DONE' ? 'TODO' : 'DONE' } : s
                                ),
                              }))
                            }}
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              sub.status === 'DONE'
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400'
                            }`}
                          >
                            {sub.status === 'DONE' && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <span className={`text-sm flex-1 ${sub.status === 'DONE' ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                            {sub.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, subtasks: prev.subtasks.filter((_, j) => j !== i) }))}
                            className="text-gray-300 dark:text-gray-600 hover:text-red-500 opacity-0 group-hover/msub:opacity-100 transition-opacity"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add new subtask */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subtaskInput}
                      onChange={e => setSubtaskInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (subtaskInput.trim()) {
                            setFormData(prev => ({
                              ...prev,
                              subtasks: [...(prev.subtasks || []), { title: subtaskInput.trim(), status: 'TODO' }],
                            }))
                            setSubtaskInput('')
                          }
                        }
                      }}
                      placeholder="Add subtask…"
                      className="flex-1 px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-0 outline-none transition-colors text-sm"
                      style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (subtaskInput.trim()) {
                          setFormData(prev => ({
                            ...prev,
                            subtasks: [...(prev.subtasks || []), { title: subtaskInput.trim(), status: 'TODO' }],
                          }))
                          setSubtaskInput('')
                        }
                      }}
                      className="px-4 py-2 rounded-xl font-bold text-sm transition-colors"
                      style={{ background: '#ecefe7', color: '#5b6159' }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

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
                  className="px-4 py-2 font-bold text-sm rounded-xl transition-colors"
                  style={{ background: '#ecefe7', color: '#5b6159' }}>
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 font-bold text-sm rounded-xl transition-colors"
                  style={{ background: '#3a6758', color: '#ffffff' }}>
                  {editingTask ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Share Dialog ──────────────────────────────────────────────────── */}
      {shareModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeShareModal}>
          <div
            className="rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            style={{ background: '#ffffff', boxShadow: '0 20px 50px rgba(46,52,45,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 mb-1">
              Share Task
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 truncate">
              {shareTaskTitle}
            </p>

            {/* Share form */}
            <form onSubmit={handleShare} className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  required
                  className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 text-sm focus:ring-0 outline-none transition-colors"
                  style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                  Permission
                </label>
                <select
                  value={sharePermission}
                  onChange={e => setSharePermission(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-gray-900 dark:text-gray-100 text-sm focus:ring-0 outline-none transition-colors"
                  style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}
                >
                  <option value="VIEW">View only</option>
                  <option value="EDIT">Can edit</option>
                </select>
              </div>

              {shareError && (
                <p className="text-xs font-bold text-red-600 dark:text-red-400">{shareError}</p>
              )}
              {shareSuccess && (
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{shareSuccess}</p>
              )}

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={closeShareModal}
                  className="px-4 py-2 font-bold text-sm rounded-xl transition-colors"
                  style={{ background: '#ecefe7', color: '#5b6159' }}>
                  Close
                </button>
                <button type="submit" disabled={shareLoading}
                  className="px-5 py-2 font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
                  style={{ background: '#3a6758', color: '#ffffff' }}>
                  {shareLoading ? 'Sharing...' : 'Share'}
                </button>
              </div>
            </form>

            {/* Existing shares */}
            <div className="border-t pt-4" style={{ borderColor: '#dee4da' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                Shared with
              </h3>
              {sharesLoading ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">Loading...</p>
              ) : existingShares.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">Not shared with anyone yet.</p>
              ) : (
                <div className="space-y-2">
                  {existingShares.map(share => (
                    <div key={share.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ border: '1px solid #dee4da' }}>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                          {share.shared_with_email || share.email || 'Unknown'}
                        </p>
                        <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">
                          {share.permission} — {share.status}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        className="text-xs font-bold text-red-500 hover:text-red-700 shrink-0"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments thread */}
            <CommentThread taskId={shareTaskId} visible={shareModal} />
          </div>
        </div>
      )}

    </div>
  )
}
