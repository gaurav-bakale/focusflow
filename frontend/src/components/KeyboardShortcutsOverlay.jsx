/**
 * KeyboardShortcutsOverlay — press `?` anywhere (outside of inputs) to show
 * a full-screen grid of shortcuts. Dismiss with `?`, Esc, or click.
 */

import React, { useEffect, useState } from 'react'

const GROUPS = [
  {
    name: 'Navigation',
    items: [
      { keys: ['G', 'D'], label: 'Dashboard' },
      { keys: ['G', 'B'], label: 'Board' },
      { keys: ['G', 'T'], label: 'Timer' },
      { keys: ['G', 'C'], label: 'Calendar' },
    ],
  },
  {
    name: 'Commands',
    items: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['?'],      label: 'Show this help' },
      { keys: ['Esc'],    label: 'Close overlay / modal' },
    ],
  },
  {
    name: 'Focus',
    items: [
      { keys: ['F'], label: 'Start focus session' },
      { keys: ['P'], label: 'Pause / resume' },
      { keys: ['R'], label: 'Reset timer' },
    ],
  },
  {
    name: 'Tasks',
    items: [
      { keys: ['N'],      label: 'New task' },
      { keys: ['/'],      label: 'Focus search' },
      { keys: ['Enter'],  label: 'Complete highlighted' },
    ],
  },
]

export default function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const isEditable = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
      if (e.key === '?' && !isEditable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9980] flex items-center justify-center p-6"
      onClick={() => setOpen(false)}
      style={{ background: 'rgba(46,52,45,0.55)', backdropFilter: 'blur(10px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl rounded-3xl p-8 relative"
        style={{
          background: '#fafaf5',
          border: '1px solid #dee4da',
          boxShadow: '0 40px 80px rgba(46,52,45,0.32)',
          animation: 'palette-in 0.25s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: '#3a6758' }}>⌨ Shortcuts</p>
            <h2
              className="text-3xl font-extrabold tracking-tight mt-1"
              style={{ fontFamily: 'Epilogue, sans-serif', color: '#2e342d' }}
            >
              Move faster<span style={{ color: '#3a6758' }}>.</span>
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: '#ecefe7', color: '#5b6159' }}
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-8">
          {GROUPS.map(group => (
            <div key={group.name}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#aeb4aa' }}>
                {group.name}
              </p>
              <ul className="space-y-2">
                {group.items.map(item => (
                  <li key={item.label} className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: '#2e342d' }}>
                      {item.label}
                    </span>
                    <span className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-xs mx-0.5" style={{ color: '#aeb4aa' }}>then</span>}
                          <kbd
                            className="text-xs font-black px-2 py-1 rounded-md"
                            style={{
                              background: '#ffffff',
                              border: '1px solid #dee4da',
                              color: '#2e342d',
                              boxShadow: '0 2px 0 #dee4da',
                              minWidth: 28,
                              textAlign: 'center',
                            }}
                          >
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs" style={{ color: '#aeb4aa' }}>
          Press <kbd className="px-1.5 py-0.5 rounded font-bold" style={{ background: '#ecefe7', color: '#5b6159' }}>?</kbd> anytime to toggle this overlay.
        </p>
      </div>
    </div>
  )
}
