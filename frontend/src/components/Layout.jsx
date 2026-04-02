/**
 * Layout — Editorial sidebar + main content area.
 *
 * Sidebar sections:
 *   • Logo header with "FocusFlow" branding
 *   • Navigation links with colored underline on active
 *   • Timer status (when active)
 *   • Daily goal badge at bottom
 *   • User footer with logout
 */

import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer } from '../context/TimerContext'
import { useTheme } from '../context/ThemeContext'
import { PHASES } from '../context/timerPhases'
import { fetchStats } from '../services/otherServices'
import { fetchTasks } from '../services/taskService'
import SketchLine from './SketchLine'

const NAV = [
  { to: '/',         label: 'Dashboard',  end: true,  color: '#FBBF24' },
  { to: '/board',    label: 'Board',      end: false, color: '#FB7185' },
  { to: '/timer',    label: 'Timer',      end: false, color: '#34D399' },
  { to: '/calendar', label: 'Calendar',   end: false, color: '#38BDF8' },
  { to: '/ai',       label: 'Canvas AI',  end: false, color: '#A78BFA' },
  { to: '/shared',   label: 'Shared',     end: false, color: '#EC4899' },
]

const PHASE_CONFIG = {
  [PHASES.FOCUS]:       { label: 'Focus',       dot: 'bg-emerald-400' },
  [PHASES.SHORT_BREAK]: { label: 'Short Break', dot: 'bg-sky-400' },
  [PHASES.LONG_BREAK]:  { label: 'Long Break',  dot: 'bg-amber-400' },
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { phase, display } = useTimer()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [goalPct, setGoalPct] = useState(0)

  useEffect(() => {
    async function loadGoal() {
      try {
        const [stats, tasks] = await Promise.all([fetchStats(), fetchTasks()])
        const done = stats?.tasks_done ?? 0
        const pending = tasks?.filter(t => !t.is_complete)?.length ?? 0
        const total = done + pending
        setGoalPct(total > 0 ? Math.round((done / total) * 100) : 0)
      } catch (_) { /* non-blocking */ }
    }
    loadGoal()
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const timerConfig = PHASE_CONFIG[phase]

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-950">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-52 border-r-2 border-gray-900 dark:border-gray-700 flex flex-col shrink-0 bg-white dark:bg-gray-950">

        {/* Logo */}
        <div className="px-6 py-6 border-b-2 border-gray-900 dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>
              <span className="text-white text-xs font-extrabold">F</span>
            </div>
            <span className="text-base font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">FocusFlow</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <div className="space-y-1">
            {NAV.map(({ to, label, end, color }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `sketch-hover relative block px-2 py-2 text-sm font-bold transition-colors rounded-md
                   ${isActive
                     ? 'text-gray-900 dark:text-gray-100 sketch-active'
                     : 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
                   }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                        style={{ background: color }}
                      />
                    )}
                    <span className="pl-2">{label}</span>
                    <SketchLine color={color} thickness={3} />
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Active timer badge */}
        {phase !== PHASES.IDLE && timerConfig && (
          <div className="mx-4 mb-4">
            <NavLink
              to="/timer"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-gray-900 dark:border-gray-600 bg-gray-900 dark:bg-gray-800 text-white text-xs font-bold"
            >
              <span className={`w-2 h-2 rounded-full ${timerConfig.dot} animate-pulse`} />
              <span className="font-mono font-extrabold text-sm">{display}</span>
              <span className="opacity-60 ml-auto text-xs">{timerConfig.label}</span>
            </NavLink>
          </div>
        )}

        {/* Daily goal badge */}
        <div className="mx-4 mb-4">
          <div className="border-2 border-gray-900 dark:border-gray-700 rounded-lg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">Daily Goal</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 font-mono">{goalPct}%</p>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${goalPct}%`, background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }}
              />
            </div>
          </div>
        </div>

      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-950">
        {/* Top header bar */}
        <header className="shrink-0 border-b-2 border-gray-900 dark:border-gray-700 px-8 py-3 flex items-center justify-end gap-3 bg-white dark:bg-gray-950">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-extrabold shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>
              {user?.name ? user.name[0].toUpperCase() : '?'}
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{user?.name}</span>
          </div>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-gray-200 dark:border-gray-700
                       text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 transition-colors"
          >
            {dark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400
                       border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
