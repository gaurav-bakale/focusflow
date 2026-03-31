/**
 * Layout — Notion-style sidebar + main content area.
 *
 * Sidebar sections:
 *   • Workspace header (logo + workspace name)
 *   • Primary navigation
 *   • Timer status badge (when active)
 *   • User footer (avatar, name, email, logout)
 */

import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer, PHASES } from '../context/TimerContext'

const NAV = [
  {
    to: '/', label: 'Home', end: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/board', label: 'Board', end: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    to: '/timer', label: 'Focus Timer', end: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/calendar', label: 'Calendar', end: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/ai', label: 'Canvas AI', end: false,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
]

const PHASE_CONFIG = {
  [PHASES.FOCUS]:       { color: 'bg-indigo-600', label: 'Focus', dot: 'bg-indigo-400' },
  [PHASES.SHORT_BREAK]: { color: 'bg-green-600',  label: 'Short Break', dot: 'bg-green-400' },
  [PHASES.LONG_BREAK]:  { color: 'bg-sky-600',    label: 'Long Break', dot: 'bg-sky-400' },
}

function UserAvatar({ name }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  return (
    <div className="w-7 h-7 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
      {initials}
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { phase, display } = useTimer()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const timerConfig = PHASE_CONFIG[phase]

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-60 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">

        {/* Workspace header */}
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">F</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">FocusFlow</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          <p className="px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Workspace
          </p>
          <div className="space-y-0.5">
            {NAV.map(({ to, label, end, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors group
                   ${isActive
                     ? 'bg-white text-gray-900 shadow-sm font-medium border border-gray-200'
                     : 'text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm hover:border hover:border-gray-200 border border-transparent'
                   }`
                }
              >
                <span className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0">
                  {icon}
                </span>
                {label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Active timer badge */}
        {phase !== PHASES.IDLE && timerConfig && (
          <div className="mx-2 mb-2">
            <NavLink
              to="/timer"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-white text-xs font-medium ${timerConfig.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${timerConfig.dot} animate-pulse`} />
              <span className="font-mono font-semibold">{display}</span>
              <span className="opacity-75 ml-auto">{timerConfig.label}</span>
            </NavLink>
          </div>
        )}

        {/* User footer */}
        <div className="border-t border-gray-200 p-2">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white hover:shadow-sm hover:border hover:border-gray-200 border border-transparent transition-colors"
            >
              <UserAvatar name={user?.name} />
              <div className="min-w-0 flex-1 text-left">
                <p className="text-xs font-semibold text-gray-800 truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 truncate">{user?.preferences?.theme === 'dark' ? '🌙 Dark' : '☀ Light'} theme</p>
              </div>
              <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-white" onClick={() => userMenuOpen && setUserMenuOpen(false)}>
        <Outlet />
      </main>
    </div>
  )
}
