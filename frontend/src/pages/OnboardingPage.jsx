/**
 * OnboardingPage — 3-step wizard collected after first registration.
 *
 * Step 1: Pomodoro durations (work / short break / long break)
 * Step 2: Workspace preferences (theme + timezone)
 * Step 3: All set — redirect to dashboard
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
]

const TOTAL_STEPS = 3

function StepDots({ current }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-10">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300
            ${i + 1 === current
              ? 'w-6 h-2 bg-indigo-600'
              : i + 1 < current
                ? 'w-2 h-2 bg-indigo-400'
                : 'w-2 h-2 bg-gray-200 dark:bg-gray-700'
            }`}
        />
      ))}
    </div>
  )
}

function NumberInput({ label, hint, value, onChange, min, max }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {hint && <span className="text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600
                     flex items-center justify-center text-lg font-light transition-colors"
        >
          −
        </button>
        <div className="flex-1 text-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</span>
          <span className="text-gray-400 dark:text-gray-500 text-sm ml-1">min</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600
                     flex items-center justify-center text-lg font-light transition-colors"
        >
          +
        </button>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-3 accent-indigo-600 h-1 cursor-pointer"
      />
    </div>
  )
}

export default function OnboardingPage() {
  const { completeOnboarding, user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [prefs, setPrefs] = useState({
    pomodoro_duration: 25,
    short_break: 5,
    long_break: 15,
    timezone: 'UTC',
    theme: 'light',
  })

  function set(field) {
    return (val) => setPrefs(p => ({ ...p, [field]: val }))
  }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep(s => Math.max(s - 1, 1)) }

  async function handleFinish() {
    setSubmitting(true)
    setError('')
    try {
      await completeOnboarding(prefs)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100 tracking-tight">FocusFlow</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-10">
          <StepDots current={step} />

          {/* ── Step 1: Pomodoro durations ─────────────────────────────────── */}
          {step === 1 && (
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-2">
                Step 1 of {TOTAL_STEPS}
              </p>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Set your Pomodoro rhythm</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
                Adjust the session lengths to match your focus style. You can change these anytime.
              </p>

              <div className="space-y-7">
                <NumberInput
                  label="Focus session"
                  hint="5–60 min"
                  value={prefs.pomodoro_duration}
                  onChange={set('pomodoro_duration')}
                  min={5} max={60}
                />
                <div className="border-t border-gray-100 dark:border-gray-800" />
                <NumberInput
                  label="Short break"
                  hint="1–30 min"
                  value={prefs.short_break}
                  onChange={set('short_break')}
                  min={1} max={30}
                />
                <div className="border-t border-gray-100 dark:border-gray-800" />
                <NumberInput
                  label="Long break"
                  hint="5–60 min, after 4 sessions"
                  value={prefs.long_break}
                  onChange={set('long_break')}
                  min={5} max={60}
                />
              </div>

              <button
                onClick={next}
                className="w-full mt-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* ── Step 2: Theme + Timezone ─────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-2">
                Step 2 of {TOTAL_STEPS}
              </p>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Customize your workspace</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
                Pick a theme and your local timezone for accurate calendar blocks.
              </p>

              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Appearance</p>
                  <div className="grid grid-cols-2 gap-3">
                    {['light', 'dark'].map(theme => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => setPrefs(p => ({ ...p, theme }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                          ${prefs.theme === theme
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                      >
                        <div className={`w-10 h-7 rounded-md border ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-700'}`} />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">{theme}</span>
                        {prefs.theme === theme && (
                          <span className="text-indigo-600 text-xs font-semibold">✓ Selected</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Timezone</label>
                  <select
                    value={prefs.timezone}
                    onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                               bg-white dark:bg-gray-800 appearance-none"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-10">
                <button
                  onClick={back}
                  className="flex-1 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium py-2.5 rounded-lg text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={next}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: All set ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="text-center">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-2">
                Step 3 of {TOTAL_STEPS}
              </p>

              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
                🎯
              </div>

              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                You&apos;re all set, {user?.name?.split(' ')[0]}!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 leading-relaxed">
                Your workspace is ready. Start by adding your first task or jumping into a focus session.
              </p>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 text-left space-y-2 mb-8">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Your settings</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Focus session</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{prefs.pomodoro_duration} min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Short break</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{prefs.short_break} min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Long break</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{prefs.long_break} min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Theme</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{prefs.theme}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Timezone</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{prefs.timezone.replace(/_/g, ' ')}</span>
                </div>
              </div>

              {error && (
                <div className="mb-5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-800 px-4 py-3 rounded-lg text-left">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={back}
                  disabled={submitting}
                  className="flex-1 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={submitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg text-sm
                             transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {submitting ? 'Setting up…' : 'Go to Dashboard'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
