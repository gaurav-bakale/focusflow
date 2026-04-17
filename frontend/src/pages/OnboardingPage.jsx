/**
 * OnboardingPage — 3-step wizard collected after first registration.
 *
 * Step 1: Pomodoro durations (work / short break / long break)
 * Step 2: Timezone preference
 * Step 3: All set — redirect to dashboard
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ANIM_CSS = `
  @keyframes fade-up {
    from{ opacity:0; transform:translateY(16px) scale(.99); }
    to  { opacity:1; transform:translateY(0) scale(1); }
  }
  .ob-card { animation:fade-up .45s cubic-bezier(.22,1,.36,1) forwards; }
  .pc-input { transition:border-color .2s,box-shadow .2s; }
  .pc-input:focus {
    border-color:#3a6758 !important;
    box-shadow:0 0 0 3px rgba(58,103,88,.12);
    outline:none;
  }
  .pc-btn {
    background:#3a6758;
    transition:background .2s,transform .15s,box-shadow .15s;
  }
  .pc-btn:hover {
    background:#2e5b4c;
    transform:translateY(-1px);
    box-shadow:0 8px 24px rgba(58,103,88,.3);
  }
  .pc-btn:active { transform:translateY(0); }
  .pc-btn:disabled { opacity:.6; cursor:not-allowed; transform:none; box-shadow:none; }
  .pc-btn-outline {
    border:1.5px solid #dee4da;
    color:#5b6159;
    transition:background .15s,border-color .15s;
  }
  .pc-btn-outline:hover { background:#f3f4ee; border-color:#aeb4aa; }
  input[type=range] {
    -webkit-appearance:none;
    height:4px;
    border-radius:9999px;
    background:#dee4da;
    cursor:pointer;
    width:100%;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance:none;
    width:18px;
    height:18px;
    border-radius:50%;
    background:#3a6758;
    border:2px solid white;
    box-shadow:0 1px 4px rgba(58,103,88,.35);
    cursor:pointer;
    margin-top:-7px;
  }
  input[type=range]::-webkit-slider-runnable-track {
    height:4px;
    border-radius:9999px;
  }
`

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
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width:  i + 1 === current ? '24px' : '8px',
            height: '8px',
            background: i + 1 <= current ? '#3a6758' : '#dee4da',
          }}
        />
      ))}
    </div>
  )
}

function NumberInput({ label, hint, value, onChange, min, max }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-xs font-semibold" style={{ color:'#5b6159' }}>{label}</label>
        {hint && <span className="text-xs" style={{ color:'#aeb4aa' }}>{hint}</span>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-light transition-colors"
          style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#5b6159' }}
        >
          −
        </button>
        <div className="flex-1 text-center">
          <span className="text-2xl font-black" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>{value}</span>
          <span className="text-sm ml-1" style={{ color:'#aeb4aa' }}>min</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-light transition-colors"
          style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#5b6159' }}
        >
          +
        </button>
      </div>
      <div className="relative mt-3">
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #3a6758 ${pct}%, #dee4da ${pct}%)`,
          }}
        />
      </div>
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
    <div className="min-h-screen flex flex-col" style={{ background:'#fafaf5' }}>
      <style>{ANIM_CSS}</style>

      {/* Header */}
      <header className="px-8 py-5" style={{ borderBottom:'1px solid #dee4da', background:'#ffffff' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:'#3a6758' }}>
            <span className="text-base">⚡</span>
          </div>
          <span className="font-black tracking-tight" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>FocusFlow</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="ob-card w-full max-w-md"
          style={{ background:'#ffffff', borderRadius:'24px', boxShadow:'0 8px 40px rgba(46,52,45,0.10)', border:'1px solid #dee4da' }}>
          <div className="px-8 py-10">
            <StepDots current={step} />

            {/* ── Step 1: Pomodoro durations ──────────────────────────────── */}
            {step === 1 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color:'#3a6758' }}>
                  Step 1 of {TOTAL_STEPS}
                </p>
                <h2 className="text-2xl font-black mb-1" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
                  Set your Pomodoro rhythm
                </h2>
                <p className="text-sm mb-8" style={{ color:'#767c74' }}>
                  Adjust the session lengths to match your focus style. You can change these anytime.
                </p>

                <div className="space-y-6">
                  <NumberInput
                    label="Focus session" hint="5–60 min"
                    value={prefs.pomodoro_duration} onChange={set('pomodoro_duration')}
                    min={5} max={60}
                  />
                  <div style={{ height:'1px', background:'#dee4da' }} />
                  <NumberInput
                    label="Short break" hint="1–30 min"
                    value={prefs.short_break} onChange={set('short_break')}
                    min={1} max={30}
                  />
                  <div style={{ height:'1px', background:'#dee4da' }} />
                  <NumberInput
                    label="Long break" hint="5–60 min, after 4 sessions"
                    value={prefs.long_break} onChange={set('long_break')}
                    min={5} max={60}
                  />
                </div>

                <button onClick={next} className="pc-btn w-full mt-10 text-white font-bold py-3.5 rounded-xl text-sm">
                  Continue →
                </button>
              </div>
            )}

            {/* ── Step 2: Timezone ────────────────────────────────────────── */}
            {step === 2 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color:'#3a6758' }}>
                  Step 2 of {TOTAL_STEPS}
                </p>
                <h2 className="text-2xl font-black mb-1" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
                  Set your timezone
                </h2>
                <p className="text-sm mb-8" style={{ color:'#767c74' }}>
                  Your local timezone ensures calendar blocks and reminders show at the right time.
                </p>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                    Timezone
                  </label>
                  <select
                    value={prefs.timezone}
                    onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))}
                    className="pc-input w-full px-4 py-3 rounded-xl text-sm appearance-none"
                    style={{ background:'#f3f4ee', border:'1.5px solid #dee4da', color:'#2e342d' }}
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 mt-10">
                  <button onClick={back} className="pc-btn-outline flex-1 font-semibold py-3.5 rounded-xl text-sm bg-transparent">
                    Back
                  </button>
                  <button onClick={next} className="pc-btn flex-1 text-white font-bold py-3.5 rounded-xl text-sm">
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: All set ─────────────────────────────────────────── */}
            {step === 3 && (
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color:'#3a6758' }}>
                  Step 3 of {TOTAL_STEPS}
                </p>

                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
                  style={{ background:'#ecefe7' }}>
                  🎯
                </div>

                <h2 className="text-2xl font-black mb-2" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
                  You&apos;re all set, {user?.name?.split(' ')[0]}!
                </h2>
                <p className="text-sm mb-8 leading-relaxed" style={{ color:'#767c74' }}>
                  Your workspace is ready. Start by adding your first task or jumping into a focus session.
                </p>

                <div className="rounded-2xl p-5 text-left space-y-3 mb-8" style={{ background:'#f3f4ee', border:'1px solid #dee4da' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color:'#aeb4aa' }}>
                    Your settings
                  </p>
                  {[
                    ['Focus session', `${prefs.pomodoro_duration} min`],
                    ['Short break',   `${prefs.short_break} min`],
                    ['Long break',    `${prefs.long_break} min`],
                    ['Timezone',      prefs.timezone.replace(/_/g, ' ')],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span style={{ color:'#767c74' }}>{label}</span>
                      <span className="font-semibold" style={{ color:'#2e342d' }}>{val}</span>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mb-5 flex items-start gap-2 text-sm px-4 py-3 rounded-xl text-left"
                    style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#b91c1c' }}>
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={back} disabled={submitting}
                    className="pc-btn-outline flex-1 font-semibold py-3.5 rounded-xl text-sm bg-transparent disabled:opacity-50">
                    Back
                  </button>
                  <button onClick={handleFinish} disabled={submitting}
                    className="pc-btn flex-1 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
                    {submitting && (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {submitting ? 'Setting up…' : 'Go to Dashboard →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
