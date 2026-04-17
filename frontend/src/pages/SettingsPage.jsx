/**
 * SettingsPage — User settings including Gemini API key and data export.
 */

import React, { useEffect, useState } from 'react'
import { saveApiKey, checkApiKey } from '../services/authService'
import { exportData } from '../services/otherServices'

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Export state
  const [exportLoading, setExportLoading] = useState(null)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    checkApiKey()
      .then(res => setHasKey(res.has_key))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await saveApiKey(apiKey.trim())
      setHasKey(true)
      setApiKey('')
      setMessage('Gemini API key saved successfully.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save API key.')
    } finally {
      setSaving(false)
    }
  }

  async function handleExport(type, format) {
    const key = `${type}-${format}`
    setExportLoading(key)
    setExportError('')
    try {
      await exportData(type, format)
    } catch (err) {
      setExportError(err.response?.data?.detail || `Failed to export ${type}.`)
    } finally {
      setExportLoading(null)
    }
  }

  const exportOptions = [
    {
      type: 'tasks',
      label: 'Tasks',
      description: 'All your tasks with subtasks, priorities, and categories',
      icon: '📋',
    },
    {
      type: 'sessions',
      label: 'Pomodoro Sessions',
      description: 'All focus session history with duration and timestamps',
      icon: '⏱️',
    },
    {
      type: 'blocks',
      label: 'Calendar Blocks',
      description: 'All time blocks including recurring series',
      icon: '📅',
    },
  ]

  return (
    <div className="px-10 py-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-extrabold tracking-tight mb-1" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
        Settings
      </h1>
      <p className="text-sm mb-8" style={{ color:'#767c74' }}>
        Manage your account settings and integrations.
      </p>

      {/* ── Gemini API Key ─────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 mb-5" style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 4px 16px rgba(46,52,45,0.05)' }}>
        <div className="flex items-center gap-2 mb-1">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" fill="#ecefe7"/><path d="M9 5v4l2.5 2" stroke="#3a6758" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color:'#5b6159' }}>
            Gemini API Key
          </h2>
        </div>
        <p className="text-sm mb-4" style={{ color:'#767c74' }}>
          Required for AI features (Prioritize, Breakdown, Schedule, Frog, Tips).
          Get a free key from{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color:'#3a6758', textDecoration:'underline' }}
          >
            Google AI Studio
          </a>.
        </p>

        {loading ? (
          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full" style={{ background: hasKey ? '#3a6758' : '#ef4444' }} />
              <span className="text-sm font-semibold" style={{ color:'#5b6159' }}>
                {hasKey ? 'API key configured' : 'No API key set'}
              </span>
            </div>

            <form onSubmit={handleSave} className="flex gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={hasKey ? 'Enter new key to replace…' : 'Paste your Gemini API key…'}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
                style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#2e342d' }}
              />
              <button
                type="submit"
                disabled={saving || !apiKey.trim()}
                className="px-5 py-2.5 font-bold text-sm rounded-xl text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background:'#3a6758' }}
              >
                {saving ? 'Saving…' : 'Save Key'}
              </button>
            </form>

            {message && (
              <p className="mt-3 text-sm font-semibold" style={{ color:'#3a6758' }}>{message}</p>
            )}
            {error && (
              <p className="mt-3 text-sm font-semibold" style={{ color:'#b91c1c' }}>{error}</p>
            )}
          </>
        )}
      </div>

      {/* ── Data Export ────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6" style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 4px 16px rgba(46,52,45,0.05)' }}>
        <div className="flex items-center gap-2 mb-1">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" fill="#ecefe7"/><path d="M9 5v6M6 9l3 3 3-3" stroke="#3a6758" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color:'#5b6159' }}>
            Export Your Data
          </h2>
        </div>
        <p className="text-sm mb-5" style={{ color:'#767c74' }}>
          Download your data as CSV (for Excel/Sheets) or JSON (for programmatic access).
        </p>

        {exportError && (
          <p className="mb-4 text-sm font-semibold" style={{ color:'#b91c1c' }}>{exportError}</p>
        )}

        {/* Individual exports */}
        <div className="space-y-3 mb-5">
          {exportOptions.map(({ type, label, description, icon }) => (
            <div
              key={type}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ background:'#f3f4ee' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color:'#2e342d' }}>{label}</p>
                  <p className="text-xs" style={{ color:'#aeb4aa' }}>{description}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleExport(type, 'csv')}
                  disabled={exportLoading === `${type}-csv`}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ border:'1.5px solid #dee4da', color:'#5b6159', background:'#ffffff' }}
                >
                  {exportLoading === `${type}-csv` ? '…' : 'CSV'}
                </button>
                <button
                  onClick={() => handleExport(type, 'json')}
                  disabled={exportLoading === `${type}-json`}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white"
                  style={{ background:'#3a6758' }}
                >
                  {exportLoading === `${type}-json` ? '…' : 'JSON'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Full dump */}
        <div className="pt-4 mt-2" style={{ borderTop:'1px solid #dee4da' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color:'#2e342d' }}>
                🗂️ Complete Data Dump
              </p>
              <p className="text-xs mt-0.5" style={{ color:'#aeb4aa' }}>
                All tasks, sessions, and calendar blocks in one JSON file
              </p>
            </div>
            <button
              onClick={() => handleExport('all', 'json')}
              disabled={exportLoading === 'all-json'}
              className="px-4 py-2 text-xs font-bold rounded-xl text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background:'#3a6758' }}
            >
              {exportLoading === 'all-json' ? 'Exporting…' : 'Export All (JSON)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
