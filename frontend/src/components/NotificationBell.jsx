/**
 * NotificationBell — Bell icon with unread count badge and dropdown list.
 *
 * Features:
 *   • Polls unread count every 30 seconds
 *   • Listens for WebSocket deadline_notification events for real-time updates
 *   • Dropdown shows notifications with mark-read and delete actions
 *   • "Mark all read" bulk action
 *   • Color-coded badges: red (overdue), amber (1h), blue (24h)
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../services/otherServices'
import { useNotifications } from '../context/NotificationContext'

const TYPE_STYLES = {
  OVERDUE:       'bg-red-100 text-red-700 border-red-200',
  DEADLINE_1H:   'bg-amber-100 text-amber-700 border-amber-200',
  DEADLINE_24H:  'bg-blue-100 text-blue-700 border-blue-200',
}

const TYPE_LABELS = {
  OVERDUE:       'Overdue',
  DEADLINE_1H:   'Due in 1h',
  DEADLINE_24H:  'Due in 24h',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const { lastMessage } = useNotifications()

  // Fetch unread count
  const refreshCount = useCallback(async () => {
    try {
      const res = await fetchUnreadCount()
      setUnreadCount(res.count)
    } catch (_) {}
  }, [])

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Poll unread count every 30s
  useEffect(() => {
    refreshCount()
    const interval = setInterval(refreshCount, 30000)
    return () => clearInterval(interval)
  }, [refreshCount])

  // Listen for real-time WebSocket notifications
  useEffect(() => {
    if (lastMessage?.type === 'deadline_notification') {
      setUnreadCount(prev => prev + 1)
      // If dropdown is open, refresh the list
      if (open) {
        loadNotifications()
      }
      // Browser push notification
      const n = lastMessage.notification
      if (n && 'Notification' in window && Notification.permission === 'granted') {
        const typeLabel = TYPE_LABELS[n.notification_type] || 'Deadline'
        new Notification(`${typeLabel}: ${n.task_title}`, {
          body: n.message,
          icon: '/favicon.ico',
          tag: n.id, // prevent duplicate browser notifications
        })
      }
    }
  }, [lastMessage])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function loadNotifications() {
    setLoading(true)
    try {
      const data = await fetchNotifications()
      setNotifications(Array.isArray(data) ? data : [])
    } catch (_) {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  function toggleDropdown() {
    const next = !open
    setOpen(next)
    if (next) loadNotifications()
  }

  async function handleMarkRead(id) {
    try {
      await markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (_) {}
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (_) {}
  }

  async function handleDelete(id) {
    const wasUnread = notifications.find(n => n.id === id && !n.read)
    try {
      await deleteNotification(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (_) {}
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={toggleDropdown}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg border-2 border-gray-200 dark:border-gray-700
                   text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b-2 border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-300 dark:text-gray-600 font-medium">No notifications</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3 transition-colors ${
                    n.read ? 'opacity-60' : 'bg-indigo-50/30 dark:bg-indigo-950/20'
                  }`}
                >
                  {/* Type badge */}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${TYPE_STYLES[n.type] || TYPE_STYLES.DEADLINE_24H}`}>
                    {TYPE_LABELS[n.type] || n.type}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {n.task_title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {n.message}
                    </p>
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!n.read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        title="Mark as read"
                        className="text-gray-300 dark:text-gray-600 hover:text-indigo-500 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      title="Delete"
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
