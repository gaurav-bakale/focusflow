/**
 * Layout Component
 *
 * Persistent sidebar + main content area.
 * Sidebar contains navigation links and the mini Pomodoro status badge.
 * Uses React Router's <Outlet /> for nested page rendering.
 */

import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer, PHASES } from '../context/TimerContext'

const NAV = [
  { to: '/',         label: 'Dashboard', icon: '🏠' },
  { to: '/board',    label: 'Board',     icon: '📋' },
  { to: '/timer',    label: 'Timer',     icon: '⏱️' },
  { to: '/calendar', label: 'Calendar',  icon: '📅' },
  { to: '/ai',       label: 'Canvas AI', icon: '✨' },
]

const PHASE_COLORS = {
  [PHASES.FOCUS]:       'bg-indigo-600',
  [PHASES.SHORT_BREAK]: 'bg-green-500',
  [PHASES.LONG_BREAK]:  'bg-blue-500',
  [PHASES.IDLE]:        'bg-gray-300',
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { phase, display } = useTimer()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-100">
          <span className="text-xl font-bold text-indigo-600">⚡ FocusFlow</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                 ${isActive
                   ? 'bg-indigo-50 text-indigo-700'
                   : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
              }
            >
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>

        {/* Timer badge */}
        {phase !== PHASES.IDLE && (
          <div className={`mx-3 mb-3 px-3 py-2 rounded-lg text-white text-xs font-mono flex items-center gap-2 ${PHASE_COLORS[phase]}`}>
            <span className="animate-pulse">●</span>
            <span>{display}</span>
            <span className="opacity-80 capitalize">{phase.replace('_', ' ').toLowerCase()}</span>
          </div>
        )}

        {/* User + logout */}
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <p className="font-medium text-gray-700 truncate">{user?.name}</p>
          <button onClick={logout} className="mt-1 text-red-500 hover:underline">
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
