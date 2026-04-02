/**
 * ActivityPage — Personal activity feed showing collaboration timeline.
 *
 * Features:
 *   • Lists the user's own activity events, newest first
 *   • Color-coded action badges per event type
 *   • Relative timestamps (e.g. "2 hours ago")
 *   • Filter by action type
 */

import React, { useEffect, useState, useMemo } from 'react'
import { fetchMyActivity } from '../services/sharingService'

const ACTION_CONFIG = {
  TASK_CREATED:      { label: 'Created Task',      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800' },
  TASK_UPDATED:      { label: 'Updated Task',      badge: 'bg-sky-100     text-sky-700     border-sky-200     dark:bg-sky-950/40    dark:text-sky-400    dark:border-sky-800' },
  TASK_COMPLETED:    { label: 'Completed Task',    badge: 'bg-indigo-100  text-indigo-700  border-indigo-200  dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800' },
  TASK_SHARED:       { label: 'Shared Task',       badge: 'bg-pink-100    text-pink-700    border-pink-200    dark:bg-pink-950/40   dark:text-pink-400   dark:border-pink-800' },
  COMMENT_ADDED:     { label: 'Commented',          badge: 'bg-amber-100   text-amber-700   border-amber-200   dark:bg-amber-950/40  dark:text-amber-400  dark:border-amber-800' },
  COMMENT_UPDATED:   { label: 'Edited Comment',     badge: 'bg-amber-100   text-amber-700   border-amber-200   dark:bg-amber-950/40  dark:text-amber-400  dark:border-amber-800' },
  COMMENT_DELETED:   { label: 'Deleted Comment',    badge: 'bg-red-100     text-red-700     border-red-200     dark:bg-red-950/40    dark:text-red-400    dark:border-red-800' },
  WORKSPACE_CREATED: { label: 'Created Workspace',  badge: 'bg-orange-100  text-orange-700  border-orange-200  dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800' },
  MEMBER_ADDED:      { label: 'Added Member',       badge: 'bg-violet-100  text-violet-700  border-violet-200  dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800' },
  MEMBER_REMOVED:    { label: 'Removed Member',     badge: 'bg-gray-100    text-gray-600    border-gray-200    dark:bg-gray-800      dark:text-gray-400   dark:border-gray-700' },
}

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'TASKS', label: 'Tasks' },
  { value: 'COMMENTS', label: 'Comments' },
  { value: 'WORKSPACES', label: 'Workspaces' },
]

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ActivityPage() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('ALL')

  useEffect(() => { loadActivity() }, [])

  async function loadActivity() {
    try {
      const data = await fetchMyActivity(100)
      setActivities(Array.isArray(data) ? data : [])
    } catch (_) {
      setActivities([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'ALL') return activities
    if (filter === 'TASKS') return activities.filter(a => a.action.startsWith('TASK_'))
    if (filter === 'COMMENTS') return activities.filter(a => a.action.startsWith('COMMENT_'))
    if (filter === 'WORKSPACES') return activities.filter(a => a.action === 'WORKSPACE_CREATED' || a.action === 'MEMBER_ADDED' || a.action === 'MEMBER_REMOVED')
    return activities
  }, [activities, filter])

  const stats = useMemo(() => ({
    total: activities.length,
    tasks: activities.filter(a => a.action.startsWith('TASK_')).length,
    comments: activities.filter(a => a.action.startsWith('COMMENT_')).length,
    workspaces: activities.filter(a => ['WORKSPACE_CREATED', 'MEMBER_ADDED', 'MEMBER_REMOVED'].includes(a.action)).length,
  }), [activities])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
          Activity Feed
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your collaboration timeline
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total, color: 'border-indigo-300 dark:border-indigo-700' },
          { label: 'Tasks', value: stats.tasks, color: 'border-emerald-300 dark:border-emerald-700' },
          { label: 'Comments', value: stats.comments, color: 'border-amber-300 dark:border-amber-700' },
          { label: 'Workspaces', value: stats.workspaces, color: 'border-orange-300 dark:border-orange-700' },
        ].map(s => (
          <div key={s.label} className={`border-2 ${s.color} rounded-lg px-4 py-3`}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-6">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors
              ${filter === f.value
                ? 'border-gray-900 dark:border-gray-400 bg-gray-900 dark:bg-gray-700 text-white'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">
            {activities.length === 0
              ? 'No activity yet. Start collaborating to see your timeline.'
              : 'No activity matches this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(activity => {
            const config = ACTION_CONFIG[activity.action] || { label: activity.action, badge: 'bg-gray-100 text-gray-600 border-gray-200' }
            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 px-4 py-3 border-l-2 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
              >
                {/* Timeline dot */}
                <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 mt-1.5 shrink-0 -ml-[5px]" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border rounded ${config.badge}`}>
                      {config.label}
                    </span>
                    {activity.target_title && (
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                        {activity.target_title}
                      </span>
                    )}
                  </div>
                  {activity.detail && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {activity.detail}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0 mt-0.5">
                  {relativeTime(activity.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
