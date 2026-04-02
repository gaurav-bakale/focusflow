/**
 * SettingsPage — User settings including Gemini API key management.
 */

import React, { useEffect, useState } from 'react'
import { saveApiKey, checkApiKey } from '../services/authService'

export default function SettingsPage() {
  const [apiKey, setApiKey]       = useState('')
  const [hasKey, setHasKey]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [message, setMessage]     = useState('')
  const [error, setError]         = useState('')

  useEffect(() => {
    checkApiKey()
      .then(res => setHasKey(res.has_key))
      .catch(() => {})
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

  return (
    <div className="px-10 py-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-2">
        Settings
      </h1>
      <p className="text-base text-gray-400 dark:text-gray-500 mb-8">
        Manage your account settings and integrations.
      </p>

      {/* Gemini API Key */}
      <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
          Gemini API Key
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Required for AI features (Prioritize, Breakdown, Schedule, Frog, Tips).
          Get a free key from{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            Google AI Studio
          </a>.
        </p>

        {loading ? (
          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ) : (
          <>
            {/* Status badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                {hasKey ? 'API key configured' : 'No API key set'}
              </span>
            </div>

            <form onSubmit={handleSave} className="flex gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={hasKey ? 'Enter new key to replace…' : 'Paste your Gemini API key…'}
                className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors
                           placeholder-gray-300 dark:placeholder-gray-600"
              />
              <button
                type="submit"
                disabled={saving || !apiKey.trim()}
                className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm
                           rounded-lg border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200
                           transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save Key'}
              </button>
            </form>

            {message && (
              <p className="mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{message}</p>
            )}
            {error && (
              <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
