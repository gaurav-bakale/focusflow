/**
 * Layout — Papercut-style sidebar shell.
 *
 * Sidebar:
 *   • FocusFlow logo + wordmark
 *   • Nav items as rounded-l-full pills (active = forest green fill)
 *   • Active timer badge
 *   • Daily goal progress
 *   • Logout at bottom
 *
 * Header:
 *   • Frosted glass bar with user avatar + notification bell
 */

import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimer } from '../context/TimerContext'
import { PHASES } from '../context/timerPhases'
import { fetchStats } from '../services/otherServices'
import { fetchTasks } from '../services/taskService'
import NotificationBell from './NotificationBell'

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV = [
  { to: '/',          label: 'Dashboard',  end: true  },
  { to: '/board',     label: 'Board',      end: false },
  { to: '/timer',     label: 'Timer',      end: false },
  { to: '/calendar',  label: 'Calendar',   end: false },
  { to: '/shared',    label: 'Shared',     end: false },
  { to: '/workspaces',label: 'Workspaces', end: false },
  { to: '/activity',  label: 'Activity',   end: false },
  { to: '/settings',  label: 'Settings',   end: false },
]

// ── SVG icons ──────────────────────────────────────────────────────────────────
function Icon({ name }) {
  const cls = 'w-[18px] h-[18px] shrink-0'
  switch (name) {
    case 'Dashboard':   return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    case 'Board':       return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="13" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/></svg>
    case 'Timer':       return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5" strokeLinecap="round"/><path d="M9.5 2.5h5" strokeLinecap="round"/></svg>
    case 'Calendar':    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4" strokeLinecap="round"/></svg>
    case 'Shared':      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.4 13.4l7.2 4.1M15.6 6.6L8.4 10.6" strokeLinecap="round"/></svg>
    case 'Workspaces':  return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round"/></svg>
    case 'Activity':    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'Settings':    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    default: return null
  }
}

// ── Timer phase config ─────────────────────────────────────────────────────────
const PHASE_CONFIG = {
  [PHASES.FOCUS]:       { label: 'Focus',       dot: 'bg-emerald-400' },
  [PHASES.SHORT_BREAK]: { label: 'Short Break', dot: 'bg-sky-400'     },
  [PHASES.LONG_BREAK]:  { label: 'Long Break',  dot: 'bg-amber-400'   },
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { phase, display } = useTimer()
  const navigate = useNavigate()
  const [goalPct, setGoalPct] = useState(0)

  useEffect(() => {
    async function loadGoal() {
      try {
        const [stats, tasks] = await Promise.all([fetchStats(), fetchTasks()])
        const done    = stats?.tasks_done ?? 0
        const pending = tasks?.filter(t => !t.is_complete)?.length ?? 0
        const total   = done + pending
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
    <div className="flex h-screen overflow-hidden" style={{ background: '#fafaf5' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className="h-screen w-64 fixed left-0 top-0 flex flex-col py-8 z-30 rounded-r-3xl"
        style={{
          background: '#f3f4ee',
          boxShadow: '10px 0 30px rgba(46,52,45,0.04)',
        }}
      >
        {/* Logo */}
        <div className="px-8 mb-10 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#3a6758' }}
          >
            <span className="text-white text-lg font-black" style={{ fontFamily: 'Epilogue, sans-serif' }}>⚡</span>
          </div>
          <div>
            <h1
              className="font-black text-lg leading-none"
              style={{ fontFamily: 'Epilogue, sans-serif', color: '#3a6758' }}
            >
              FocusFlow
            </h1>
            <p className="text-[10px] uppercase tracking-widest font-bold mt-1" style={{ color: '#5b6159' }}>
              Productivity Suite
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 ml-4 pl-4 py-3 text-sm font-bold rounded-l-full transition-all duration-200
                 ${isActive
                   ? 'text-white shadow-sm'
                   : 'hover:translate-x-0.5'
                 }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: '#3a6758', color: '#ffffff' }
                  : { color: '#5b6159' }
              }
              onMouseEnter={e => {
                if (!e.currentTarget.classList.contains('text-white')) {
                  e.currentTarget.style.background = '#dee4da'
                }
              }}
              onMouseLeave={e => {
                if (!e.currentTarget.classList.contains('text-white')) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <Icon name={label} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Active timer badge */}
        {phase !== PHASES.IDLE && timerConfig && (
          <div className="mx-4 mb-3">
            <NavLink
              to="/timer"
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-bold"
              style={{ background: '#3a6758', boxShadow: '0 4px 12px rgba(58,103,88,0.25)' }}
            >
              <span className={`w-2 h-2 rounded-full ${timerConfig.dot} animate-pulse`} />
              <span className="font-mono font-extrabold text-sm">{display}</span>
              <span className="opacity-60 ml-auto">{timerConfig.label}</span>
            </NavLink>
          </div>
        )}

        {/* Daily goal */}
        <div className="mx-4 mb-4">
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(46,52,45,0.05)' }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#5b6159' }}>Daily Goal</p>
            <p className="text-2xl font-black" style={{ fontFamily: 'Epilogue, sans-serif', color: '#3a6758' }}>{goalPct}%</p>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#dee4da' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${goalPct}%`, background: '#3a6758' }}
              />
            </div>
          </div>
        </div>

        {/* Bottom: logout */}
        <div className="px-6 pt-4" style={{ borderTop: '1px solid rgba(174,180,170,0.2)' }}>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-l-full text-sm font-medium transition-colors"
            style={{ color: '#5b6159' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#9f403d'; e.currentTarget.style.background = '#dee4da' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#5b6159'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden ml-64" style={{ background: '#fafaf5' }}>

        {/* Header */}
        <header
          className="shrink-0 flex items-center justify-between px-8 py-4 sticky top-0 z-40"
          style={{
            background: 'rgba(250,250,245,0.85)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(46,52,45,0.06)',
          }}
        >
          {/* Left: page context (empty — pages handle their own headings) */}
          <div />

          {/* Right: user + notifications + theme */}
          <div className="flex items-center gap-3">
            <NotificationBell />

            <div className="w-px h-5" style={{ background: '#dee4da' }} />

            {/* User pill */}
            <div
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-full"
              style={{ background: '#ecefe7' }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                style={{ background: '#3a6758' }}
              >
                {user?.name ? user.name[0].toUpperCase() : '?'}
              </div>
              <span className="text-sm font-bold" style={{ color: '#2e342d' }}>{user?.name}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
