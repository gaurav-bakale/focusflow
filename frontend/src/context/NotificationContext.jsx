/**
 * NotificationContext — WebSocket-powered real-time notifications.
 *
 * Connects to the backend WebSocket endpoint with the user's JWT.
 * Displays toast notifications when collaboration events arrive
 * (task shared, comment added, workspace member joined, etc.).
 *
 * Design patterns:
 *   Observer  — the WebSocket connection acts as the subscription;
 *               incoming messages trigger UI updates (toasts).
 *   Context   — React Context provides notification state to all children.
 */

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'

const NotificationContext = createContext()

const ACTION_LABELS = {
  TASK_SHARED:       'shared a task with you',
  COMMENT_ADDED:     'commented on a task',
  COMMENT_UPDATED:   'edited a comment',
  COMMENT_DELETED:   'deleted a comment',
  MEMBER_ADDED:      'added you to a workspace',
  MEMBER_REMOVED:    'removed you from a workspace',
  TASK_UPDATED:      'updated a shared task',
  TASK_COMPLETED:    'completed a task',
  WORKSPACE_CREATED: 'created a workspace',
  TASK_CREATED:      'created a task',
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  const addToast = useCallback((message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message }])
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    if (!user) return

    const token = localStorage.getItem('ff_token')
    if (!token) return

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(`${protocol}//${host}/ws?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        // Connected — clear any reconnect timer
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current)
          reconnectTimer.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          // Add to notification list
          setNotifications(prev => [data, ...prev].slice(0, 50))
          // Show toast
          const actionLabel = ACTION_LABELS[data.action] || data.action
          const actor = data.actor_name || 'Someone'
          const target = data.target_title ? ` "${data.target_title}"` : ''
          addToast(`${actor} ${actionLabel}${target}`)
        } catch (_) {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        // Reconnect after 3 seconds
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }
  }, [user, addToast])

  return (
    <NotificationContext.Provider value={{ notifications, toasts, dismissToast }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
