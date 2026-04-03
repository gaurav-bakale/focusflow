/**
 * ToastContainer — Renders real-time notification toasts.
 *
 * Positioned at the bottom-right corner. Each toast auto-dismisses
 * after 5 seconds or can be manually closed.
 */

import React from 'react'
import { useNotifications } from '../context/NotificationContext'

export default function ToastContainer() {
  const { toasts, dismissToast } = useNotifications()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="flex items-start gap-2 px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg border-2 border-gray-700 dark:border-gray-300 shadow-lg animate-slide-in"
        >
          <div className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-600 mt-1.5 shrink-0 animate-pulse" />
          <p className="text-xs font-bold flex-1">{toast.message}</p>
          <button
            onClick={() => dismissToast(toast.id)}
            className="text-gray-400 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 text-sm font-bold shrink-0 ml-2"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
