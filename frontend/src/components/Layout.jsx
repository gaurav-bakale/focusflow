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
import { useTimer, PHASES } from '../context/TimerContext'
import { fetchStats } from '../services/otherServices'
import { fetchTasks } from '../services/taskService'

const NAV = [
  { to: '/',         label: 'Dashboard',  end: true,  accent: 'bg-amber-400' },
  { to: '/board',    label: 'Board',      end: false, accent: 'bg-rose-400' },
  { to: '/timer',    label: 'Timer',      end: false, accent: 'bg-emerald-400' },
  { to: '/calendar', label: 'Calendar',   end: false, accent: 'bg-sky-400' },
  { to: '/ai',       label: 'Canvas AI',  end: false, accent: 'bg-violet-400' },
]

const PHASE_CONFIG = {
  [PHASES.FOCUS]:       { label: 'Focus',       dot: 'bg-emerald-400' },
  [PHASES.SHORT_BREAK]: { label: 'Short Break', dot: 'bg-sky-400' },
  [PHASES.LONG_BREAK]:  { label: 'Long Break',  dot: 'bg-amber-400' },
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { phase, display } = useTimer()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
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
    <div className="flex h-screen overflow-hidden bg-white">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-52 border-r-2 border-gray-900 flex flex-col shrink-0 bg-white">

        {/* Logo */}
        <div className="px-6 py-6 border-b-2 border-gray-900">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-extrabold">F</span>
            </div>
            <span className="text-base font-extrabold text-gray-900 tracking-tight">FocusFlow</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <div className="space-y-1">
            {NAV.map(({ to, label, end, accent }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative block px-2 py-2 text-sm font-bold transition-colors
                   ${isActive
                     ? 'text-gray-900'
                     : 'text-gray-400 hover:text-gray-900'
                   }`
                }
              >
                {({ isActive }) => (
                  <>
                    {label}
                    {isActive && (
                      <span className={`absolute -bottom-0.5 left-2 right-2 h-1 rounded-full ${accent}`} />
                    )}
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
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-gray-900 bg-gray-900 text-white text-xs font-bold"
            >
              <span className={`w-2 h-2 rounded-full ${timerConfig.dot} animate-pulse`} />
              <span className="font-mono font-extrabold text-sm">{display}</span>
              <span className="opacity-60 ml-auto text-xs">{timerConfig.label}</span>
            </NavLink>
          </div>
        )}

        {/* Daily goal badge */}
        <div className="mx-4 mb-4">
          <div className="border-2 border-gray-900 rounded-lg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Daily Goal</p>
            <p className="text-2xl font-extrabold text-gray-900 font-mono">{goalPct}%</p>
          </div>
        </div>

        {/* User footer */}
        <div className="border-t-2 border-gray-900 p-3">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-extrabold shrink-0">
                {user?.name ? user.name[0].toUpperCase() : '?'}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-xs font-bold text-gray-900 truncate">{user?.name}</p>
              </div>
              <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border-2 border-gray-900 rounded-lg py-1 z-50">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-900 hover:bg-gray-50 transition-colors"
                >
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
