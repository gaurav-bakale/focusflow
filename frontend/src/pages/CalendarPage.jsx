/**
 * CalendarPage — Google/Apple Calendar-inspired interactive planner.
 *
 * Layout:
 *   Sidebar  │  Header (nav + view switcher + filters)
 *            │  FullCalendar grid
 *
 * Features:
 *  • Mini month calendar in sidebar (dots on days with events, today circled)
 *  • Day / Week / 4-Day / Month views
 *  • Task deadlines as all-day events, color-coded by priority
 *  • Time blocks draggable + resizable
 *  • Click event → floating popover (Google Calendar style)
 *  • Quick-complete task from popover
 *  • Filter sidebar checkboxes: Blocks / Tasks / High / Medium / Low
 *  • Custom day-header: "MON\n31" with today circled
 *  • Red now-indicator line
 */

import React, {
  useEffect, useState, useRef, useMemo, useCallback,
} from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin  from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { fetchBlocks, createBlock, updateBlock, deleteBlock } from '../services/otherServices'
import { fetchTasks, markTaskComplete } from '../services/taskService'
import { useTimer } from '../context/TimerContext'
import { detectOverlap } from '../utils/detectOverlap'

// ── Priority config ───────────────────────────────────────────────────────────
const P = {
  HIGH:   { dot: '#f87171', bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', label: 'High',   badge: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800'    },
  MEDIUM: { dot: '#fbbf24', bg: '#fffbeb', border: '#fde68a', text: '#78350f', label: 'Medium', badge: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800' },
  LOW:    { dot: '#a3e635', bg: '#f7fee7', border: '#bef264', text: '#365314', label: 'Low',    badge: 'bg-lime-50 dark:bg-lime-950/50 text-lime-700 dark:text-lime-400 ring-1 ring-lime-200 dark:ring-lime-800'   },
}
const S_BADGE = {
  TODO:        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  IN_PROGRESS: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400',
  DONE:        'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400',
}
const S_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' }
const BLOCK_PALETTE = ['#6366f1','#3b82f6','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#1e293b']

// ── FullCalendar CSS overrides — Google Calendar aesthetic ───────────────────
const FC_CSS = `
  .fc { font-family: inherit; }

  /* Remove harsh scrollgrid borders */
  .fc .fc-scrollgrid { border: none !important; }
  .fc .fc-scrollgrid-section > * { border: none !important; }
  .fc .fc-scrollgrid-section-header > * { border-bottom: 1px solid #e2e8f0 !important; }

  /* Time grid slots */
  .fc .fc-timegrid-slot        { border-color: #f1f5f9 !important; height: 52px; }
  .fc .fc-timegrid-slot-minor  { border-color: transparent !important; }
  .fc .fc-timegrid-slot-label  { border: none !important; }
  .fc .fc-timegrid-slot-label-cushion {
    font-size: 10px !important; font-weight: 600 !important;
    color: #94a3b8 !important; text-transform: uppercase !important;
    letter-spacing: 0.06em !important; padding: 0 10px 0 0 !important;
  }

  /* Column lines */
  .fc .fc-timegrid-col { border-color: #f1f5f9 !important; }
  .fc .fc-col-header-cell { border: none !important; background: white; }
  .fc .fc-col-header { border-bottom: 1px solid #e2e8f0 !important; }

  /* Today column */
  .fc .fc-day-today                  { background: #f8faff !important; }
  .fc .fc-timegrid-col.fc-day-today  { background: #f8faff !important; }

  /* Events */
  .fc .fc-event {
    border: none !important; border-radius: 6px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important; cursor: pointer;
  }
  .fc .fc-event:hover { filter: brightness(0.92); box-shadow: 0 3px 8px rgba(0,0,0,0.18) !important; }
  .fc .fc-event-selected { box-shadow: 0 0 0 3px rgba(59,130,246,0.35) !important; }

  /* All-day row */
  .fc .fc-daygrid-body   { border-bottom: 1px solid #e2e8f0 !important; }
  .fc .fc-daygrid-day    { border-color: #f1f5f9 !important; min-height: 28px; }
  .fc .fc-daygrid-event  { border-radius: 4px !important; font-size: 11px !important; margin: 1px 2px !important; }
  .fc .fc-all-day-text   { font-size: 9px !important; font-weight: 700 !important; color: #94a3b8 !important; text-transform: uppercase; letter-spacing: 0.08em; }

  /* Month view */
  .fc .fc-daygrid-day-frame   { padding: 2px 4px !important; }
  .fc .fc-daygrid-day-number  { font-size: 13px !important; font-weight: 400 !important; color: #374151 !important; text-decoration: none !important; padding: 4px !important; }
  .fc .fc-day-today .fc-daygrid-day-number {
    background: #1e293b; color: white !important; border-radius: 50%;
    width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-weight: 700 !important;
  }

  /* Now indicator — red, Google style */
  .fc .fc-now-indicator-line { border-color: #ef4444 !important; border-top-width: 2px !important; }
  .fc .fc-now-indicator-arrow { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; border: none !important; margin-top: -3px; }

  /* Selection highlight */
  .fc .fc-highlight { background: rgba(99,102,241,0.08) !important; border-radius: 4px; }

  /* Popover (month "+more") */
  .fc .fc-more-popover { border: 1px solid #e2e8f0 !important; border-radius: 12px !important; box-shadow: 0 10px 30px rgba(0,0,0,0.12) !important; }

  /* Projected recurring events — lighter/dashed to signal "future occurrence" */
  .fc .fc-projected { opacity: 0.65 !important; }
  .fc .fc-projected .fc-event-main { font-style: italic; }

  /* ── Dark mode overrides ─────────────────────────────────────────────────── */
  .dark .fc .fc-scrollgrid-section-header > * { border-bottom: 1px solid #1e293b !important; }
  .dark .fc .fc-timegrid-slot        { border-color: #1e293b !important; }
  .dark .fc .fc-timegrid-slot-minor  { border-color: transparent !important; }
  .dark .fc .fc-timegrid-slot-label-cushion { color: #475569 !important; }
  .dark .fc .fc-timegrid-col { border-color: #1e293b !important; }
  .dark .fc .fc-col-header-cell { border: none !important; background: #0f172a !important; }
  .dark .fc .fc-col-header { border-bottom: 1px solid #1e293b !important; }
  .dark .fc .fc-col-header-cell-cushion { color: #94a3b8 !important; text-decoration: none !important; }
  .dark .fc .fc-day-today .fc-col-header-cell-cushion { color: #818cf8 !important; }
  .dark .fc .fc-day-today                  { background: rgba(99,102,241,0.08) !important; }
  .dark .fc .fc-timegrid-col.fc-day-today  { background: rgba(99,102,241,0.06) !important; }
  .dark .fc .fc-scrollgrid { background: #0f172a !important; }
  .dark .fc .fc-timegrid-body { background: #0f172a !important; }
  .dark .fc .fc-view-harness { background: #0f172a !important; }
  .dark .fc .fc-daygrid-body   { border-bottom: 1px solid #1e293b !important; }
  .dark .fc .fc-daygrid-day    { border-color: #1e293b !important; background: #0f172a; }
  .dark .fc .fc-day-today.fc-daygrid-day { background: rgba(99,102,241,0.08) !important; }
  .dark .fc .fc-daygrid-day-number  { color: #94a3b8 !important; }
  .dark .fc .fc-day-today .fc-daygrid-day-number { background: #6366f1; color: white !important; }
  .dark .fc .fc-now-indicator-line { border-color: #f87171 !important; }
  .dark .fc .fc-now-indicator-arrow { background: #f87171; }
  .dark .fc .fc-highlight { background: rgba(99,102,241,0.15) !important; }
  .dark .fc .fc-more-popover { background: #1e293b !important; border: 1px solid #334155 !important; }
  .dark .fc .fc-more-popover .fc-popover-header { background: #1e293b !important; color: #e2e8f0 !important; }
  .dark .fc .fc-all-day-text { color: #475569 !important; }
  .dark .fc .fc-timegrid-axis-cushion { color: #475569 !important; }
  .dark .fc-theme-standard td, .dark .fc-theme-standard th { border-color: #1e293b !important; }
  .dark .fc-theme-standard .fc-scrollgrid { border-color: #1e293b !important; }
`

// ── Recurrence expansion helpers ─────────────────────────────────────────────

/** Advance one ISO date string by one recurrence step. */
function nextRecurDate(dateStr, recurrence) {
  const [y, mo, d] = dateStr.split('-').map(Number)
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
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(d, lastDay))
  } else {
    return null // NONE — no advancement
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Return all occurrence dates for a recurring task in [startDeadline, windowEnd].
 * For non-recurring tasks returns [startDeadline] (single entry).
 */
function expandDates(startDeadline, recurrence, windowEndStr) {
  if (!startDeadline) return []
  if (!recurrence || recurrence === 'NONE') return [startDeadline]
  const dates = []
  let cur = startDeadline
  let safety = 0
  while (cur && cur <= windowEndStr && safety++ < 500) {
    dates.push(cur)
    cur = nextRecurDate(cur, recurrence)
  }
  return dates
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (iso, opts) => iso ? new Date(iso).toLocaleDateString('en-US', opts) : ''
const fmtTime = iso => iso
  ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  : ''
const fmtLocal = iso => iso ? iso.slice(0, 16) : ''
const duration = (s, e) => {
  if (!s || !e) return ''
  const m = Math.round((new Date(e) - new Date(s)) / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

// ── Mini month calendar with month/year picker ───────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MiniCalendar({ onDateSelect, eventDates, syncMonth }) {
  const [month,     setMonth]     = useState(() => new Date())
  const [picker,    setPicker]    = useState(null) // null | 'month' | 'year'
  const [yearPage,  setYearPage]  = useState(() => new Date().getFullYear())

  useEffect(() => {
    if (syncMonth) setMonth(new Date(syncMonth))
  }, [syncMonth])

  const { days } = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth()
    const first = new Date(y, m, 1)
    const last  = new Date(y, m + 1, 0)
    const pad   = first.getDay()
    const arr   = []
    for (let i = pad - 1; i >= 0; i--)
      arr.push({ d: new Date(y, m, -i),   cur: false })
    for (let i = 1; i <= last.getDate(); i++)
      arr.push({ d: new Date(y, m, i),    cur: true  })
    while (arr.length < 42)
      arr.push({ d: new Date(y, m + 1, arr.length - last.getDate() - pad + 1), cur: false })
    return { days: arr }
  }, [month])

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long' })
  const yearLabel  = month.getFullYear()

  // Year grid: show 12 years centered around yearPage
  const yearStart = yearPage - 4
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i)

  return (
    <div className="px-3 pt-2 pb-3 select-none">
      {/* Header: prev | Month Year | next */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => {
            if (picker === 'year') setYearPage(y => y - 12)
            else setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))
          }}
          className="w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Clickable month + year labels */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPicker(p => p === 'month' ? null : 'month')}
            className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors ${
              picker === 'month' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {monthLabel}
          </button>
          <button
            onClick={() => { setPicker(p => p === 'year' ? null : 'year'); setYearPage(month.getFullYear()) }}
            className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors ${
              picker === 'year' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {yearLabel}
          </button>
        </div>

        <button
          onClick={() => {
            if (picker === 'year') setYearPage(y => y + 12)
            else setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))
          }}
          className="w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      {/* Month picker */}
      {picker === 'month' && (
        <div className="grid grid-cols-3 gap-1 mb-2">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => { setMonth(d => new Date(d.getFullYear(), i, 1)); setPicker(null) }}
              className={`text-[10px] font-semibold py-1 rounded transition-colors ${
                i === month.getMonth()
                  ? 'bg-slate-800 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Year picker */}
      {picker === 'year' && (
        <div className="grid grid-cols-3 gap-1 mb-2">
          {years.map(y => (
            <button
              key={y}
              onClick={() => { setMonth(d => new Date(y, d.getMonth(), 1)); setPicker(null) }}
              className={`text-[10px] font-semibold py-1 rounded transition-colors ${
                y === month.getFullYear()
                  ? 'bg-slate-800 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Day grid (hidden while picker is open) */}
      {!picker && (
        <>
          <div className="grid grid-cols-7 mb-0.5">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <span key={i} className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 py-0.5">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map(({ d, cur }, i) => {
              const isToday   = d.getTime() === today.getTime()
              const hasEvents = eventDates.has(d.toDateString())
              return (
                <button
                  key={i}
                  onClick={() => onDateSelect(d)}
                  className={`
                    relative flex flex-col items-center justify-center
                    w-7 h-7 mx-auto rounded-full text-[11px] transition-colors
                    ${!cur ? 'text-gray-300 dark:text-gray-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}
                    ${isToday ? '!bg-slate-800 !text-white font-bold' : ''}
                  `}
                >
                  {d.getDate()}
                  {hasEvents && !isToday && (
                    <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-400" />
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Event popover (Google Calendar style) ────────────────────────────────────
function EventPopover({ popover, onEdit, onDelete, onComplete, onClose, completing }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (!popover) return null

  const { event, x, y } = popover
  const { type } = event.extendedProps

  // Smart positioning: keep within viewport
  const W = 308, H = 320
  const left = Math.min(x + 14, window.innerWidth  - W - 16)
  const top  = Math.min(y,      window.innerHeight - H - 16)

  const renderContent = () => {
    if (type === 'task') {
      const task    = event.extendedProps.task
      const ps      = P[task.priority] || P.LOW
      const overdue = task.deadline && task.status !== 'DONE' && new Date(task.deadline) < new Date()
      return (
        <>
          {/* Color band */}
          <div className="h-1.5 w-full rounded-t-xl" style={{ background: ps.dot }} />

          <div className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ps.dot }} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {event.extendedProps.isProjected ? 'Projected Occurrence' : 'Task Deadline'}
              </span>
              </div>
              <button onClick={onClose} className="text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors shrink-0 ml-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 leading-snug">{task.title}</h3>

            {task.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed line-clamp-3">{task.description}</p>
            )}

            {/* Meta */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2}/>
                  <line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/>
                  <line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/>
                  <line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/>
                </svg>
                <span className={`text-xs font-semibold ${overdue ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
                  {fmt(task.deadline, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {task.due_time && (() => {
                    const [h, m] = task.due_time.split(':').map(Number)
                    const ampm = h >= 12 ? 'PM' : 'AM'
                    return ` · ${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`
                  })()}
                  {overdue && ' · Overdue'}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ps.badge}`}>{ps.label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${S_BADGE[task.status] || ''}`}>
                  {S_LABEL[task.status] || task.status}
                </span>
                {task.recurrence && task.recurrence !== 'NONE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    ↻ {task.recurrence[0] + task.recurrence.slice(1).toLowerCase()}
                  </span>
                )}
                {task.estimated_minutes && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {task.estimated_minutes}m
                  </span>
                )}
                {task.categories?.map(c => (
                  <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{c}</span>
                ))}
              </div>
            </div>

            {/* Action */}
            {task.status !== 'DONE' && !event.extendedProps.isProjected && (
              <button
                onClick={() => onComplete(task.id)}
                disabled={completing}
                className="w-full flex items-center justify-center gap-1.5 bg-slate-800 text-white
                           text-xs font-bold py-2 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {completing
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                }
                {completing ? 'Completing…' : task.recurrence && task.recurrence !== 'NONE' ? 'Complete (↻ next)' : 'Mark Complete'}
              </button>
            )}
            {task.status !== 'DONE' && event.extendedProps.isProjected && (
              <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 italic py-1">
                Complete the current occurrence first to unlock this date.
              </p>
            )}
          </div>
        </>
      )
    }

    // Time block
    const linked = event.extendedProps.linkedTask
    const color  = event.extendedProps.color || '#1e293b'
    const start  = event.extendedProps.start_time || event.startStr
    const end    = event.extendedProps.end_time   || event.endStr

    return (
      <>
        <div className="h-1.5 w-full rounded-t-xl" style={{ background: color }} />
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Time Block</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => onEdit(event)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button
                onClick={() => onDelete(event.extendedProps.blockId)}
                className="p-1 rounded hover:bg-red-50 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
              <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 leading-snug">{event.title}</h3>

          {/* Time */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth={2}/>
                <path strokeLinecap="round" strokeWidth={2} d="M12 6v6l4 2"/>
              </svg>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {fmt(start, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {fmtTime(start)} → {fmtTime(end)}
                <span className="ml-1.5 text-gray-400 dark:text-gray-500">({duration(start, end)})</span>
              </span>
            </div>
          </div>

          {/* Linked task */}
          {linked && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Linked Task</p>
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ background: P[linked.priority]?.dot || '#94a3b8' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">{linked.title}</p>
                  <div className="flex gap-1 mt-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${P[linked.priority]?.badge || ''}`}>
                      {P[linked.priority]?.label}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${S_BADGE[linked.status] || ''}`}>
                      {S_LABEL[linked.status]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 200, width: W }}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in"
    >
      {renderContent()}
    </div>
  )
}

// ── Block create / edit modal ─────────────────────────────────────────────────
function BlockModal({ block, tasks, existingBlocks, onSave, onClose }) {
  const isNew = !block.id
  const { focusMins, shortMins } = useTimer()

  const [form, setForm] = useState({
    title:      block.title      || '',
    start_time: block.start_time || '',
    end_time:   block.end_time   || '',
    task_id:    block.task_id    || '',
    color:      block.color      || '#6366f1',
  })
  const [saving,   setSaving]   = useState(false)
  const [overlap,  setOverlap]  = useState(null) // warning message or null

  // Pomodoro presets: pure focus time only (no breaks counted)
  const pomodoroDurations = [
    { label: '1 🍅', mins: focusMins,     desc: `${focusMins}m` },
    { label: '2 🍅', mins: focusMins * 2, desc: `${focusMins * 2}m` },
    { label: '4 🍅', mins: focusMins * 4, desc: `${focusMins * 4}m` },
  ]

  function applyDuration(mins) {
    if (!form.start_time) return
    const [dp, tp = '00:00'] = form.start_time.slice(0, 16).split('T')
    const [y, mo, d] = dp.split('-').map(Number)
    const [h, mi] = tp.split(':').map(Number)
    if (!y || !mo || !d) return
    const endMs = new Date(y, mo - 1, d, h, mi).getTime() + mins * 60000
    const end = new Date(endMs)
    const pad = n => String(n).padStart(2, '0')
    const endStr = `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`
    setForm(f => ({ ...f, end_time: endStr }))
    checkOverlap(form.start_time, endStr)
  }

  function checkOverlap(start, end) {
    const conflict = detectOverlap(start, end, existingBlocks, block.id)
    if (conflict) {
      const cfmtTime = iso => {
        // Parse as local time (same logic as parseLocalDateTime) so display matches input
        const bare = iso ? iso.slice(0, 16) : ''
        if (!bare) return ''
        const [dp, tp = '00:00'] = bare.split('T')
        const [y, mo, d] = dp.split('-').map(Number)
        const [h = 0, mi = 0] = tp.split(':').map(Number)
        return new Date(y, mo - 1, d, h, mi)
          .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      }
      setOverlap(`Overlaps with "${conflict.title}" (${cfmtTime(conflict.start_time)} – ${cfmtTime(conflict.end_time)}). Pick a different time.`)
    } else {
      setOverlap(null)
    }
  }

  function handleStartChange(val) {
    setForm(f => ({ ...f, start_time: val }))
    checkOverlap(val, form.end_time)
  }

  function handleEndChange(val) {
    setForm(f => ({ ...f, end_time: val }))
    checkOverlap(form.start_time, val)
  }

  function handleTaskChange(id) {
    const task     = tasks.find(t => t.id === id)
    const prevTask = tasks.find(t => t.id === form.task_id)

    // Build a datetime-local string from the task's deadline + due_time.
    // If due_time is missing, fall back to current time rounded up to next 15 min.
    let autoStart = null
    if (task?.deadline) {
      let time = task.due_time  // "HH:MM" or undefined
      if (!time) {
        const now = new Date()
        const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * (15 * 60000))
        const pad = n => String(n).padStart(2, '0')
        time = `${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`
      }
      autoStart = `${task.deadline}T${time}`
    }

    // Auto-compute end_time = autoStart + 1 Pomodoro cycle
    let autoEnd = null
    if (autoStart) {
      const [dp, tp] = autoStart.split('T')
      const [y, mo, d] = dp.split('-').map(Number)
      const [h, mi] = tp.split(':').map(Number)
      const endMs = new Date(y, mo - 1, d, h, mi).getTime() + focusMins * 4 * 60000
      const end = new Date(endMs)
      const pad = n => String(n).padStart(2, '0')
      autoEnd = `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`
    }

    setForm(f => {
      // Only auto-fill title if it's blank or was auto-filled from the previous task
      const prevAutoTitle = prevTask?.title ?? ''
      const newTitle = (!f.title || f.title === prevAutoTitle)
        ? (task?.title || f.title)
        : f.title

      // Fill times when: start is blank, the new task has a deadline (jump to task date),
      // or we're switching away from a task that previously filled the times.
      const shouldFillTime = !f.start_time || !!task?.deadline || !!prevTask?.deadline

      return {
        ...f,
        task_id:    id,
        title:      newTitle,
        start_time: (shouldFillTime && autoStart) ? autoStart : f.start_time,
        end_time:   (shouldFillTime && autoEnd)   ? autoEnd   : f.end_time,
      }
    })

    // Re-check overlap with new times
    if (autoStart && autoEnd) checkOverlap(autoStart, autoEnd)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (overlap) return // block save when overlap exists
    setSaving(true)
    try { await onSave({ ...form, task_id: form.task_id || null }) }
    finally { setSaving(false) }
  }

  const inputCls = "w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:bg-white dark:focus:bg-gray-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-[150]" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Color top bar */}
        <div className="h-1.5" style={{ background: form.color }} />

        <div className="p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-5">
            {isNew ? 'New Time Block' : 'Edit Time Block'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Title</label>
              <input
                required placeholder="e.g. Deep Work Session"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className={inputCls}
              />
            </div>

            {/* Start — full width so AM/PM is never clipped */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Start</label>
              <input type="datetime-local" required
                value={form.start_time}
                onChange={e => handleStartChange(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Pomodoro duration presets */}
            {form.start_time && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                  Duration presets <span className="font-normal text-gray-400">(based on your Pomodoro settings)</span>
                </label>
                <div className="flex gap-2">
                  {pomodoroDurations.map(p => (
                    <button
                      key={p.label} type="button"
                      onClick={() => applyDuration(p.mins)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-400 transition-all"
                    >
                      <div>{p.label}</div>
                      <div className="text-[10px] font-normal text-gray-400 dark:text-gray-500">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* End — full width */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">End</label>
              <input type="datetime-local" required
                value={form.end_time}
                onChange={e => handleEndChange(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Overlap warning */}
            {overlap && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{overlap}</span>
              </div>
            )}

            {/* Link to task */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Link to Task <span className="font-normal text-gray-400 dark:text-gray-500">(optional — auto-fills title)</span>
              </label>
              <select
                value={form.task_id}
                onChange={e => handleTaskChange(e.target.value)}
                className={inputCls}
              >
                <option value="">— No linked task —</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>

            {/* Color */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {BLOCK_PALETTE.map(c => (
                  <button
                    key={c} type="button"
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{ background: c }}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600 scale-110' : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !!overlap}
                style={{ background: overlap ? undefined : form.color }}
                className={`flex-1 py-2.5 text-white text-sm font-bold rounded-xl transition-opacity ${overlap ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed opacity-50' : 'hover:opacity-90 disabled:opacity-50'}`}>
                {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Helper: build "now rounded to next 15 min" datetime-local string ──────────
function defaultBlockTimes(focusMins) {
  const now = new Date()
  const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * (15 * 60000))
  const pad = n => String(n).padStart(2, '0')
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const start = fmt(rounded)
  const end   = fmt(new Date(rounded.getTime() + focusMins * 4 * 60000))
  return { start, end }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const calRef = useRef(null)
  const { focusMins: pageFocusMins } = useTimer()

  const [blocks,    setBlocks]    = useState([])
  const [tasks,     setTasks]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState('timeGridWeek')
  const [calTitle,  setCalTitle]  = useState('')
  const [syncMonth, setSyncMonth] = useState(null)
  const [popover,   setPopover]   = useState(null)
  const [modal,     setModal]     = useState(null)
  const [completing, setCompleting] = useState(false)

  // Filter checkboxes (Google Calendar sidebar style)
  const [showBlocks, setShowBlocks] = useState(true)
  const [showTasks,  setShowTasks]  = useState(true)
  const [showHigh,   setShowHigh]   = useState(true)
  const [showMed,    setShowMed]    = useState(true)
  const [showLow,    setShowLow]    = useState(true)

  useEffect(() => {
    Promise.all([fetchBlocks(), fetchTasks()])
      .then(([bs, ts]) => {
        setBlocks(bs)
        setTasks(ts.filter(t => t.deadline || !t.is_complete))
      })
      .catch(err => console.error('Calendar load error:', err))
      .finally(() => setLoading(false))
  }, [])

  const taskMap = useMemo(() => {
    const m = {}
    tasks.forEach(t => { m[t.id] = t })
    return m
  }, [tasks])

  // Build all events
  const allEvents = useMemo(() => {
    const blockEvts = blocks.map(b => {
      const linked = b.task_id ? taskMap[b.task_id] : null
      const color  = b.color || '#6366f1'
      return {
        id:    `block-${b.id}`,
        title: b.title,
        start: b.start_time,
        end:   b.end_time,
        allDay: false,
        backgroundColor: color,
        borderColor:     color,
        textColor:       '#ffffff',
        editable: true,
        extendedProps: {
          type: 'block', blockId: b.id,
          task_id: b.task_id, linkedTask: linked, color,
          start_time: b.start_time, end_time: b.end_time,
        },
      }
    })

    // Expand recurring tasks into projected occurrences up to 90 days ahead
    const windowEnd = new Date()
    windowEnd.setDate(windowEnd.getDate() + 90)
    const windowEndStr = windowEnd.toISOString().split('T')[0]

    const taskEvts = []
    tasks.filter(t => t.deadline).forEach(t => {
      const ps = P[t.priority] || P.LOW
      const isRecurring = t.recurrence && t.recurrence !== 'NONE'
      // Only expand active (non-DONE) recurring tasks; DONE shows only its actual date
      const dates = (isRecurring && t.status !== 'DONE')
        ? expandDates(t.deadline, t.recurrence, windowEndStr)
        : [t.deadline]

      dates.forEach((dateStr, idx) => {
        const isProjected = idx > 0
        const hasTimed    = !!(t.due_time)
        const startDT     = hasTimed ? `${dateStr}T${t.due_time}:00` : dateStr
        const recurrencePrefix = isRecurring ? '↻ ' : ''

        let endDT
        if (hasTimed) {
          try {
            const d = new Date(startDT)
            if (!isNaN(d.getTime())) {
              d.setMinutes(d.getMinutes() + (t.estimated_minutes || 30))
              endDT = d.toISOString()
            }
          } catch (_e) { /* ignore date parse errors */ }
        }

        taskEvts.push({
          id:    isProjected ? `task-${t.id}-proj-${dateStr}` : `task-${t.id}`,
          title: `${recurrencePrefix}${t.title}`,
          start: startDT,
          ...(endDT ? { end: endDT } : {}),
          allDay: !hasTimed,
          backgroundColor: isProjected ? ps.bg + 'cc' : ps.bg,
          borderColor:     isProjected ? ps.border + '99' : ps.border,
          textColor:       ps.text,
          editable: false,
          classNames: isProjected ? ['fc-projected'] : [],
          extendedProps: { type: 'task', task: t, isProjected, projectedDate: dateStr },
        })
      })
    })

    return [...blockEvts, ...taskEvts]
  }, [blocks, tasks, taskMap])

  // Apply filters
  const filteredEvents = useMemo(() => allEvents.filter(e => {
    const { type, task, linkedTask } = e.extendedProps
    if (type === 'block') {
      if (!showBlocks) return false
      const p = linkedTask?.priority
      if (p === 'HIGH'   && !showHigh) return false
      if (p === 'MEDIUM' && !showMed)  return false
      if (p === 'LOW'    && !showLow)  return false
      return true
    }
    if (type === 'task') {
      if (!showTasks) return false
      if (task.priority === 'HIGH'   && !showHigh) return false
      if (task.priority === 'MEDIUM' && !showMed)  return false
      if (task.priority === 'LOW'    && !showLow)  return false
      return true
    }
    return true
  }), [allEvents, showBlocks, showTasks, showHigh, showMed, showLow])

  // Dynamic slot range — expand to cover any event outside 06:00-23:00
  // Mirrors Microsoft Teams / Google Calendar: always full coverage, scroll to 08:00
  const slotRange = useMemo(() => {
    let minH = 6   // default earliest hour visible
    let maxH = 23  // default latest hour visible
    filteredEvents.forEach(e => {
      if (e.allDay) return
      try {
        const s = new Date(e.start)
        if (isNaN(s.getTime())) return
        const startH = s.getHours() + s.getMinutes() / 60
        if (startH < minH) minH = Math.max(0, Math.floor(startH - 0.5))
        if (e.end) {
          const en = new Date(e.end)
          if (!isNaN(en.getTime())) {
            const endH = en.getHours() + en.getMinutes() / 60
            if (endH > maxH) maxH = Math.min(24, Math.ceil(endH + 0.5))
          }
        }
      } catch (_e) { /* ignore slot range errors */ }
    })
    // clamp
    minH = Math.max(0, minH)
    maxH = Math.min(24, maxH)
    const pad = n => String(n).padStart(2, '0')
    return {
      min:    `${pad(minH)}:00:00`,
      max:    maxH === 24 ? '24:00:00' : `${pad(maxH)}:00:00`,
      scroll: `${pad(Math.max(minH, Math.min(8, minH + 1)))}:00:00`,
    }
  }, [filteredEvents])

  // Dates that have events (for mini calendar dots)
  const eventDates = useMemo(() => {
    const s = new Set()
    allEvents.forEach(e => { if (e.start) s.add(new Date(e.start).toDateString()) })
    return s
  }, [allEvents])

  // ── Custom day header ─────────────────────────────────────────────────────
  const dayHeaderContent = useCallback((args) => {
    if (args.view.type === 'dayGridMonth') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 0', display: 'block' }}>
          {args.date.toLocaleDateString('en-US', { weekday: 'short' })}
        </span>
      )
    }
    const isToday  = args.isToday
    const dayName  = args.date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    const dayNum   = args.date.getDate()
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: isToday ? '#6366f1' : '#94a3b8' }}>
          {dayName}
        </span>
        <span style={{
          width: 34, height: 34, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 4, fontSize: 20, fontWeight: isToday ? 700 : 400,
          background: isToday ? '#1e293b' : 'transparent',
          color: isToday ? 'white' : '#374151',
        }}>
          {dayNum}
        </span>
      </div>
    )
  }, [])

  // ── Custom event renderer ─────────────────────────────────────────────────
  const eventContent = useCallback((info) => {
    const { type, linkedTask } = info.event.extendedProps

    if (type === 'task') {
      const ps = P[info.event.extendedProps.task?.priority] || P.LOW
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 4px', width: '100%', overflow: 'hidden' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ps.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {info.event.title}
          </span>
        </div>
      )
    }

    return (
      <div style={{ padding: '3px 6px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, color: '#fff' }}>
          {info.event.title}
        </span>
        {linkedTask && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            ↗ {linkedTask.title}
          </span>
        )}
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', marginTop: 'auto', lineHeight: 1 }}>
          {fmtTime(info.event.startStr)} – {fmtTime(info.event.endStr)}
        </span>
      </div>
    )
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleEventClick({ event, jsEvent }) {
    jsEvent.stopPropagation()
    setPopover({ event, x: jsEvent.clientX, y: jsEvent.clientY })
  }

  function handleDateSelect(info) {
    setModal({ title: '', start_time: fmtLocal(info.startStr), end_time: fmtLocal(info.endStr), task_id: '', color: '#6366f1' })
    info.view.calendar.unselect()
  }

  async function handleEventDrop({ event, revert }) {
    if (event.extendedProps.type !== 'block') { revert(); return }
    const blockId = event.extendedProps.blockId
    const block   = blocks.find(b => b.id === blockId)
    if (!block) { revert(); return }
    try {
      const updated = await updateBlock(blockId, { ...block, start_time: fmtLocal(event.startStr), end_time: fmtLocal(event.endStr || '') })
      setBlocks(prev => prev.map(b => b.id === blockId ? updated : b))
    } catch { revert() }
  }

  async function handleEventResize({ event, revert }) {
    const blockId = event.extendedProps.blockId
    const block   = blocks.find(b => b.id === blockId)
    if (!block) { revert(); return }
    try {
      const updated = await updateBlock(blockId, { ...block, start_time: fmtLocal(event.startStr), end_time: fmtLocal(event.endStr || '') })
      setBlocks(prev => prev.map(b => b.id === blockId ? updated : b))
    } catch { revert() }
  }

  async function handleSave(formData) {
    if (modal.id) {
      const updated = await updateBlock(modal.id, formData)
      setBlocks(prev => prev.map(b => b.id === modal.id ? updated : b))
    } else {
      const created = await createBlock(formData)
      setBlocks(prev => [...prev, created])
    }
    setModal(null)
  }

  async function handleDelete(blockId) {
    if (!confirm('Delete this time block?')) return
    await deleteBlock(blockId)
    setBlocks(prev => prev.filter(b => b.id !== blockId))
    setPopover(null)
  }

  function handleEditFromPopover(event) {
    const ep = event.extendedProps
    setModal({ id: ep.blockId, title: event.title, start_time: ep.start_time || fmtLocal(event.startStr), end_time: ep.end_time || fmtLocal(event.endStr), task_id: ep.task_id || '', color: ep.color || '#6366f1' })
    setPopover(null)
  }

  async function handleCompleteTask(taskId) {
    setCompleting(true)
    try {
      await markTaskComplete(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setPopover(null)
    } catch (_e) { /* non-blocking */ }
    setCompleting(false)
  }

  function changeView(v) {
    setView(v)
    calRef.current?.getApi().changeView(v)
  }

  function miniDateSelect(date) {
    calRef.current?.getApi().gotoDate(date)
    if (view === 'dayGridMonth') return
    calRef.current?.getApi().changeView('timeGridDay')
    setView('timeGridDay')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-gray-900" onClick={() => setPopover(null)}>
      <style>{FC_CSS}</style>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-gray-100 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">

        {/* Create button */}
        <div className="p-4">
          <button
            onClick={() => {
              const { start, end } = defaultBlockTimes(pageFocusMins)
              setModal({ title: '', start_time: start, end_time: end, task_id: '', color: '#6366f1' })
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl
                       border border-gray-200 dark:border-gray-700 hover:shadow-md text-sm font-semibold
                       text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 transition-all hover:border-gray-300 dark:hover:border-gray-600 group"
          >
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            New Task Block
          </button>
        </div>

        {/* Mini calendar */}
        <MiniCalendar
          onDateSelect={miniDateSelect}
          eventDates={eventDates}
          syncMonth={syncMonth}
        />

        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4 my-1" />

        {/* Filters */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Show</p>
          <div className="space-y-1.5">
            {/* Blocks */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input type="checkbox" checked={showBlocks} onChange={e => setShowBlocks(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer" />
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />
                Time Blocks
              </span>
            </label>
            {/* Tasks */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input type="checkbox" checked={showTasks} onChange={e => setShowTasks(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer" />
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
                Task Deadlines
              </span>
            </label>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 mt-4">Priority</p>
          <div className="space-y-1.5">
            {[
              { key: 'high',   label: 'High',   state: showHigh, setter: setShowHigh, color: P.HIGH.dot   },
              { key: 'med',    label: 'Medium', state: showMed,  setter: setShowMed,  color: P.MEDIUM.dot },
              { key: 'low',    label: 'Low',    state: showLow,  setter: setShowLow,  color: P.LOW.dot    },
            ].map(({ key, label, state, setter, color }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={state} onChange={e => setter(e.target.checked)}
                  className="w-3.5 h-3.5 rounded cursor-pointer" style={{ accentColor: color }} />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4 my-1" />

        {/* Legend */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Legend</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-3 h-3 rounded-sm bg-red-300" />Task due – High
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-3 h-3 rounded-sm bg-amber-300" />Task due – Med
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-3 h-3 rounded-sm bg-lime-300" />Task due – Low
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          {/* Nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => calRef.current?.getApi().prev()}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onClick={() => calRef.current?.getApi().next()}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200 tracking-tight min-w-0 flex-1">{calTitle}</h1>

          <button
            onClick={() => calRef.current?.getApi().today()}
            className="px-4 py-1.5 text-sm font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700
                       rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Today
          </button>

          {/* View switcher */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5">
            {[
              { v: 'timeGridDay',   label: 'Day'   },
              { v: 'timeGridWeek',  label: 'Week'  },
              { v: 'timeGrid4Day',  label: '4 Day' },
              { v: 'dayGridMonth',  label: 'Month' },
            ].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  view === v
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64 gap-3">
              <span className="w-6 h-6 border-3 border-gray-200 dark:border-gray-700 border-t-indigo-500 rounded-full animate-spin" style={{ borderWidth: 3 }} />
              <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">Loading calendar…</span>
            </div>
          ) : (
            <FullCalendar
              ref={calRef}
              plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              views={{
                timeGrid4Day: { type: 'timeGrid', duration: { days: 4 }, buttonText: '4 day' },
              }}
              headerToolbar={false}
              selectable
              selectMirror
              editable
              eventResizableFromStart
              nowIndicator
              allDaySlot
              allDayText="Due"
              slotMinTime={slotRange.min}
              slotMaxTime={slotRange.max}
              scrollTime={slotRange.scroll}
              slotLabelFormat={{ hour: 'numeric', hour12: true }}
              height="auto"
              events={filteredEvents}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              dayHeaderContent={dayHeaderContent}
              eventContent={eventContent}
              datesSet={({ view, start }) => {
                setCalTitle(view.title)
                setSyncMonth(start)
              }}
            />
          )}
        </div>
      </div>

      {/* ── Event popover ─────────────────────────────────────────────────── */}
      <EventPopover
        popover={popover}
        onEdit={handleEditFromPopover}
        onDelete={handleDelete}
        onComplete={handleCompleteTask}
        onClose={() => setPopover(null)}
        completing={completing}
      />

      {/* ── Block modal ───────────────────────────────────────────────────── */}
      {modal && (
        <BlockModal
          block={modal}
          tasks={tasks}
          existingBlocks={blocks}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
