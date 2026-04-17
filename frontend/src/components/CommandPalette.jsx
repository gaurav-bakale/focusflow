/**
 * CommandPalette — global ⌘K / Ctrl+K fuzzy launcher.
 *
 * Commands include:
 *   - Navigation to every top-level page
 *   - Quick actions: start focus, new task, sign out, toggle theme
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimer } from '../context/TimerContext'
import { useAuth } from '../context/AuthContext'

// Lightweight fuzzy score — 0 means no match, higher = better
function fuzzyScore(query, text) {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return 100 - (t.indexOf(q))
  let qi = 0, score = 0, streak = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++
      streak++
      score += 1 + streak
    } else {
      streak = 0
    }
  }
  return qi === q.length ? score : 0
}

export default function CommandPalette() {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [idx, setIdx]     = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)
  const navigate = useNavigate()
  const { startFocus, reset: resetTimer } = useTimer()
  const { logout } = useAuth()

  // Global open/close shortcut
  useEffect(() => {
    const onKey = (e) => {
      const isK = e.key === 'k' || e.key === 'K'
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // All commands
  const allCommands = useMemo(() => [
    { id: 'nav-dashboard',  group: 'Navigation', label: 'Go to Dashboard',  hint: 'Home screen',            icon: '⌂', run: () => navigate('/') },
    { id: 'nav-board',      group: 'Navigation', label: 'Go to Board',      hint: 'Kanban view',            icon: '▦', run: () => navigate('/board') },
    { id: 'nav-timer',      group: 'Navigation', label: 'Go to Timer',      hint: 'Pomodoro focus',         icon: '⏱', run: () => navigate('/timer') },
    { id: 'nav-calendar',   group: 'Navigation', label: 'Go to Calendar',   hint: 'Schedule blocks',        icon: '▧', run: () => navigate('/calendar') },
    { id: 'nav-shared',     group: 'Navigation', label: 'Go to Shared',     hint: 'Shared tasks',           icon: '⇄', run: () => navigate('/shared') },
    { id: 'nav-workspaces', group: 'Navigation', label: 'Go to Workspaces', hint: 'Teams & workspaces',     icon: '◈', run: () => navigate('/workspaces') },
    { id: 'nav-activity',   group: 'Navigation', label: 'Go to Activity',   hint: 'Recent activity',        icon: '◉', run: () => navigate('/activity') },
    { id: 'nav-settings',   group: 'Navigation', label: 'Go to Settings',   hint: 'Preferences',            icon: '⚙', run: () => navigate('/settings') },

    { id: 'act-focus',      group: 'Actions',    label: 'Start Focus Session', hint: 'Begin pomodoro',      icon: '▶', run: () => { startFocus(null); navigate('/timer') } },
    { id: 'act-reset',      group: 'Actions',    label: 'Reset Timer',         hint: 'Stop current phase',  icon: '↺', run: () => resetTimer() },
    { id: 'act-newtask',    group: 'Actions',    label: 'New Task',            hint: 'Open task board',     icon: '+', run: () => navigate('/board?new=1') },
    { id: 'act-logout',     group: 'Actions',    label: 'Sign Out',            hint: 'End session',         icon: '⇥', run: () => { logout(); navigate('/login') } },
  ], [navigate, startFocus, resetTimer, logout])

  // Filter + score
  const filtered = useMemo(() => {
    const scored = allCommands
      .map(c => ({ c, score: fuzzyScore(query, c.label + ' ' + c.hint + ' ' + c.group) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.map(x => x.c)
  }, [allCommands, query])

  // Keep active idx in bounds
  useEffect(() => { setIdx(0) }, [query])

  // Ensure active item is visible
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const active = list.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [idx, open])

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[idx]
      if (cmd) { cmd.run(); setOpen(false) }
    }
  }

  if (!open) return null

  // Group filtered by section for display
  const groups = filtered.reduce((acc, c) => {
    acc[c.group] = acc[c.group] || []
    acc[c.group].push(c)
    return acc
  }, {})

  let running = -1

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
      style={{ background: 'rgba(46,52,45,0.35)', backdropFilter: 'blur(6px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: '#ffffff',
          boxShadow: '0 40px 80px rgba(46,52,45,0.28)',
          border: '1px solid #dee4da',
          animation: 'palette-in 0.22s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#dee4da' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a6758" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent outline-none border-0 text-base font-medium placeholder:text-[#aeb4aa]"
            style={{ color: '#2e342d', fontFamily: 'Manrope, sans-serif' }}
          />
          <kbd
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded"
            style={{ background: '#ecefe7', color: '#5b6159' }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-bold" style={{ color: '#5b6159' }}>No matches</p>
              <p className="text-xs mt-1" style={{ color: '#aeb4aa' }}>Try a different search term</p>
            </div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="px-5 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest" style={{ color: '#aeb4aa' }}>
                  {group}
                </p>
                {items.map(cmd => {
                  running++
                  const isActive = running === idx
                  return (
                    <button
                      key={cmd.id}
                      data-active={isActive}
                      onMouseEnter={() => setIdx(running)}
                      onClick={() => { cmd.run(); setOpen(false) }}
                      className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors"
                      style={{
                        background: isActive ? '#ecefe7' : 'transparent',
                        color: '#2e342d',
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: isActive ? '#3a6758' : '#f3f4ee', color: isActive ? '#ffffff' : '#3a6758' }}
                      >
                        {cmd.icon}
                      </span>
                      <span className="flex-1 text-sm font-bold">{cmd.label}</span>
                      <span className="text-xs" style={{ color: '#aeb4aa' }}>{cmd.hint}</span>
                      {isActive && (
                        <kbd className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded"
                          style={{ background: '#3a6758', color: '#ffffff' }}>↵</kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t text-[10px] font-bold uppercase tracking-widest"
          style={{ borderColor: '#dee4da', background: '#fafaf5', color: '#aeb4aa' }}
        >
          <span>FocusFlow Command</span>
          <span className="flex items-center gap-2">
            <span>↑↓ navigate</span>
            <span>↵ run</span>
          </span>
        </div>
      </div>
    </div>
  )
}
