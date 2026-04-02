import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Extract readable error from any API error shape ───────────────────────────
function extractError(err) {
  const detail = err?.response?.data?.detail
  if (!detail) return 'Registration failed. Please try again.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(d => d.msg ?? String(d)).join(' · ')
  return String(detail)
}

// ── CSS animations ────────────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes blob {
    0%,100%{ border-radius:60% 40% 70% 30%/50% 60% 40% 50%; transform:translate(0,0) scale(1); }
    33%     { border-radius:40% 60% 30% 70%/60% 40% 60% 40%; transform:translate(12px,-20px) scale(1.05); }
    66%     { border-radius:70% 30% 50% 50%/30% 70% 30% 70%; transform:translate(-8px,14px) scale(0.97); }
  }
  @keyframes fade-up {
    from{ opacity:0; transform:translateY(28px) scale(.98); }
    to  { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes pulse-ring {
    0%,100%{ box-shadow:0 0 0 0 rgba(139,92,246,.4); }
    50%    { box-shadow:0 0 0 8px rgba(139,92,246,0); }
  }
  @keyframes float-up {
    0%  { opacity:0; transform:translateY(0) scale(.8); }
    20% { opacity:1; }
    80% { opacity:.8; }
    100%{ opacity:0; transform:translateY(-120px) scale(1.1); }
  }
  @keyframes orbit {
    from{ transform:rotate(0deg) translateX(44px) rotate(0deg); }
    to  { transform:rotate(360deg) translateX(44px) rotate(-360deg); }
  }
  @keyframes orbit-rev {
    from{ transform:rotate(0deg) translateX(30px) rotate(0deg); }
    to  { transform:rotate(-360deg) translateX(30px) rotate(360deg); }
  }
  @keyframes stat-count {
    from{ opacity:0; transform:scale(.5); }
    to  { opacity:1; transform:scale(1); }
  }
  .anim-blob-1{ animation:blob 10s ease-in-out infinite; }
  .anim-blob-2{ animation:blob 14s ease-in-out infinite reverse; }
  .anim-blob-3{ animation:blob 18s ease-in-out infinite 3s; }
  .anim-card  { animation:fade-up .55s cubic-bezier(.22,1,.36,1) forwards; }
  .logo-ring  { animation:pulse-ring 3s ease-in-out infinite; }
  .stagger-1  { animation:fade-up .5s  .05s cubic-bezier(.22,1,.36,1) both; }
  .stagger-2  { animation:fade-up .5s  .10s cubic-bezier(.22,1,.36,1) both; }
  .stagger-3  { animation:fade-up .5s  .15s cubic-bezier(.22,1,.36,1) both; }
  .stagger-4  { animation:fade-up .5s  .20s cubic-bezier(.22,1,.36,1) both; }
  .stagger-5  { animation:fade-up .5s  .25s cubic-bezier(.22,1,.36,1) both; }
  .stagger-6  { animation:fade-up .5s  .30s cubic-bezier(.22,1,.36,1) both; }
  .btn-shimmer{
    background:linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899,#8b5cf6);
    background-size:300% auto;
    transition:background-position .6s,transform .15s,box-shadow .15s;
  }
  .btn-shimmer:hover{
    background-position:right center;
    transform:translateY(-1px);
    box-shadow:0 8px 28px rgba(139,92,246,.5);
  }
  .btn-shimmer:active{ transform:translateY(0); }
  .input-field{ transition:border-color .2s,box-shadow .2s; }
  .input-field:focus{
    border-color:#8b5cf6 !important;
    box-shadow:0 0 0 3px rgba(139,92,246,.15);
    outline:none;
  }
  .strength-bar{ transition:width .4s cubic-bezier(.22,1,.36,1),background-color .3s; }
  .float-icon{ animation:float-up 4s ease-in-out infinite; }
  .orbit-dot-1{ animation:orbit 4s linear infinite; }
  .orbit-dot-2{ animation:orbit 6s linear infinite reverse; }
  .orbit-dot-3{ animation:orbit-rev 5s linear infinite; }
  @keyframes progress-fill {
    0%  { width:0%; }
    60% { width:100%; }
    100%{ width:100%; }
  }
  @keyframes pulse-dot {
    0%,100%{ transform:scale(1); opacity:1; }
    50%    { transform:scale(1.4); opacity:.7; }
  }
  @keyframes block-slide {
    from{ opacity:0; transform:translateX(12px); }
    to  { opacity:1; transform:translateX(0); }
  }
  .progress-bar-1{ animation:progress-fill 3s 0.2s ease-in-out infinite; }
  .progress-bar-2{ animation:progress-fill 3s 1.1s ease-in-out infinite; }
  .progress-bar-3{ animation:progress-fill 3s 2.0s ease-in-out infinite; }
  .live-dot      { animation:pulse-dot 1.8s ease-in-out infinite; }
  .block-slide-1 { animation:block-slide .5s .1s both; }
  .block-slide-2 { animation:block-slide .5s .3s both; }
  .block-slide-3 { animation:block-slide .5s .5s both; }
  .block-slide-4 { animation:block-slide .5s .7s both; }
`

// ── Password strength ─────────────────────────────────────────────────────────
const PW_RULES = [
  { label: 'At least 8 characters',       test: v => v.length >= 8 },
  { label: 'One uppercase letter (A–Z)',   test: v => /[A-Z]/.test(v) },
  { label: 'One number (0–9)',             test: v => /[0-9]/.test(v) },
  { label: 'One special character (!@#…)', test: v => /[^A-Za-z0-9]/.test(v) },
]

function PasswordStrength({ password }) {
  const results = PW_RULES.map(r => ({ ...r, ok: r.test(password) }))
  const score   = results.filter(r => r.ok).length

  const cfg = [null,
    { label:'Weak',   color:'#f87171' },
    { label:'Fair',   color:'#fbbf24' },
    { label:'Good',   color:'#818cf8' },
    { label:'Strong', color:'#34d399' },
  ][score]

  if (!password) return null
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex gap-1.5">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full strength-bar"
              style={{ width: i <= score ? '100%' : '0%', background: cfg?.color || 'transparent' }}/>
          </div>
        ))}
      </div>
      {cfg && <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label} password</p>}
      <ul className="space-y-1 pt-0.5">
        {results.map(r => (
          <li key={r.label} className="flex items-center gap-1.5 text-xs"
            style={{ color: r.ok ? '#34d399' : 'rgba(255,255,255,0.35)' }}>
            <span>{r.ok ? '✓' : '○'}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Left decoration: orbiting focus elements ──────────────────────────────────
function OrbitSide() {
  return (
    <div className="hidden xl:flex flex-col items-center gap-8 w-56 select-none">
      {/* Orbit animation */}
      <div className="relative w-40 h-40 flex items-center justify-center">
        {/* Center */}
        <div className="absolute w-12 h-12 rounded-full flex items-center justify-center z-10"
          style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          <span className="text-white text-xl font-black">F</span>
        </div>
        {/* Orbit rings */}
        <div className="absolute w-32 h-32 rounded-full" style={{ border:'1px dashed rgba(99,102,241,0.2)' }}/>
        <div className="absolute w-24 h-24 rounded-full" style={{ border:'1px dashed rgba(167,139,250,0.15)' }}/>
        {/* Orbiting dots */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="orbit-dot-1 flex items-center justify-center w-8 h-8">
            <span className="text-lg">🎯</span>
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="orbit-dot-2 flex items-center justify-center w-8 h-8">
            <span className="text-lg">⚡</span>
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="orbit-dot-3 flex items-center justify-center w-8 h-8">
            <span className="text-lg">✅</span>
          </div>
        </div>
      </div>

      {/* Floating emojis */}
      <div className="relative h-20 w-full overflow-hidden">
        {['📅','🧠','🔥','✨'].map((icon, i) => (
          <span key={i} className="float-icon absolute text-xl"
            style={{ left:`${[10,40,65,85][i]}%`, bottom:0, animationDelay:`${i * 1.1}s`, animationDuration:'4.5s' }}>
            {icon}
          </span>
        ))}
      </div>

      <div className="text-center">
        <p className="text-white/60 text-sm font-semibold">Everything in orbit</p>
        <p className="text-white/30 text-xs mt-1">Tasks · Focus · Calendar · AI</p>
      </div>
    </div>
  )
}

// ── Right decoration: animated daily schedule ────────────────────────────────
function ScheduleSide() {
  const blocks = [
    { time:'9:00', label:'Deep Work',      color:'#818cf8', width:'85%', bar:'progress-bar-1' },
    { time:'10:30',label:'Review Tasks',   color:'#34d399', width:'60%', bar:'progress-bar-2' },
    { time:'11:00',label:'Team Sync',      color:'#fbbf24', width:'40%', bar:'progress-bar-3' },
    { time:'2:00', label:'Focus Session',  color:'#f472b6', width:'70%', bar:'progress-bar-1' },
  ]
  return (
    <div className="hidden xl:flex flex-col items-start gap-3 w-56 select-none">
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-1">
        <div>
          <p className="text-white/60 text-sm font-semibold">Today&apos;s plan</p>
          <p className="text-white/30 text-xs mt-0.5">Your schedule, visualised</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="live-dot w-1.5 h-1.5 rounded-full" style={{ background:'#34d399' }}/>
          <span className="text-[10px] font-semibold" style={{ color:'#34d399' }}>Live</span>
        </div>
      </div>

      {/* Time blocks */}
      {blocks.map((b, i) => (
        <div key={i} className={`block-slide-${i + 1} w-full px-3 py-3 rounded-xl`}
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.7)' }}>{b.label}</span>
            <span className="text-[10px] font-mono" style={{ color:'rgba(255,255,255,0.3)' }}>{b.time}</span>
          </div>
          {/* Animated progress bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.07)' }}>
            <div className={`${b.bar} h-full rounded-full`}
              style={{ background: `linear-gradient(90deg, ${b.color}99, ${b.color})`, maxWidth: b.width }}/>
          </div>
        </div>
      ))}

      {/* Pomodoro indicator */}
      <div className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2 mt-1"
        style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)' }}>
        <span className="text-base">🍅</span>
        <div className="flex gap-1">
          {[1,2,3,4].map(i => (
            <div key={i} className="w-3 h-3 rounded-full"
              style={{ background: i <= 2 ? '#6366f1' : 'rgba(99,102,241,0.25)' }}/>
          ))}
        </div>
        <span className="text-[10px] font-semibold ml-auto" style={{ color:'rgba(255,255,255,0.4)' }}>2 / 4 done</span>
      </div>
    </div>
  )
}

const STEPS = [
  { n:'1', title:'Create account',  desc:'Under 60 seconds' },
  { n:'2', title:'Set preferences', desc:'Personalise workspace' },
  { n:'3', title:'Start deep work', desc:'Focus & accomplish' },
]

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate     = useNavigate()
  const [form, setForm]         = useState({ name:'', email:'', password:'', confirm:'' })
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPw, setShowPw]     = useState(false)
  const [showCfm, setShowCfm]   = useState(false)

  const pwScore = PW_RULES.filter(r => r.test(form.password)).length

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (pwScore < 4) { setError('Password does not meet all requirements.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
      navigate('/onboarding')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-10"
      style={{ background:'linear-gradient(135deg,#0f0c29,#1a1535,#24243e)' }}>
      <style>{ANIM_CSS}</style>

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="anim-blob-1 absolute w-96 h-96 opacity-20"
          style={{ background:'radial-gradient(circle,#8b5cf6,#ec4899)', top:'-10%', right:'-5%', filter:'blur(56px)' }}/>
        <div className="anim-blob-2 absolute w-80 h-80 opacity-15"
          style={{ background:'radial-gradient(circle,#6366f1,#38bdf8)', bottom:'-8%', left:'-8%', filter:'blur(48px)' }}/>
        <div className="anim-blob-3 absolute w-56 h-56 opacity-10"
          style={{ background:'radial-gradient(circle,#a78bfa,#6366f1)', top:'45%', left:'20%', filter:'blur(36px)' }}/>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage:'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize:'48px 48px' }}/>
      </div>

      {/* Three-column: left deco | card | right deco */}
      <div className="relative flex items-center justify-center gap-12 w-full max-w-5xl mx-auto">
        <OrbitSide />

        {/* Card */}
        <div className="anim-card w-full max-w-md shrink-0"
          style={{ background:'rgba(255,255,255,0.04)', backdropFilter:'blur(24px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'24px', boxShadow:'0 32px 80px rgba(0,0,0,0.5)' }}>
          <div className="px-8 py-10">

            {/* Logo */}
            <div className="stagger-1 flex flex-col items-center mb-6">
              <div className="logo-ring w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background:'linear-gradient(135deg,#6366f1,#ec4899)' }}>
                <span className="text-white text-2xl font-black">F</span>
              </div>
              <span className="text-white text-xl font-bold tracking-tight">FocusFlow</span>
              <span className="text-white/40 text-xs mt-1">Your deep work application</span>
            </div>

            {/* Steps */}
            <div className="stagger-2 flex items-center justify-center gap-2 mb-7">
              {STEPS.map(({ n, title }, i) => (
                <React.Fragment key={n}>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background:'rgba(99,102,241,0.25)', color:'#a78bfa', border:'1px solid rgba(99,102,241,0.4)' }}>
                      {n}
                    </div>
                    <span className="text-[10px] font-medium text-center hidden sm:block"
                      style={{ color:'rgba(255,255,255,0.35)' }}>{title}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-px max-w-[36px] mb-4" style={{ background:'rgba(99,102,241,0.2)' }}/>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Heading */}
            <div className="stagger-3 text-center mb-7">
              <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
              <p className="text-white/50 text-sm">Join and start doing your best work</p>
            </div>

            {/* Error — persistent until next submit */}
            {error && (
              <div className="mb-5 flex items-start gap-2 text-sm px-4 py-3 rounded-xl"
                style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', color:'#fca5a5' }}>
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="stagger-3">
                <label htmlFor="name" className="block text-xs font-semibold mb-1.5" style={{ color:'rgba(255,255,255,0.6)' }}>
                  Full name
                </label>
                <input id="name" type="text" required autoComplete="name" placeholder="Jane Smith"
                  className="input-field w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'white' }}
                  value={form.name} onChange={set('name')}/>
              </div>

              <div className="stagger-4">
                <label htmlFor="email" className="block text-xs font-semibold mb-1.5" style={{ color:'rgba(255,255,255,0.6)' }}>
                  Email address
                </label>
                <input id="email" type="email" required autoComplete="email" placeholder="you@example.com"
                  className="input-field w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'white' }}
                  value={form.email} onChange={set('email')}/>
              </div>

              <div className="stagger-5">
                <label htmlFor="password" className="block text-xs font-semibold mb-1.5" style={{ color:'rgba(255,255,255,0.6)' }}>
                  Password
                </label>
                <div className="relative">
                  <input id="password" type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    className="input-field w-full px-4 py-3 pr-16 rounded-xl text-sm"
                    style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'white' }}
                    value={form.password} onChange={set('password')}/>
                  <button type="button" onClick={() => setShowPw(p => !p)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color:'rgba(255,255,255,0.4)' }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                <PasswordStrength password={form.password}/>
              </div>

              <div className="stagger-5">
                <label htmlFor="confirm" className="block text-xs font-semibold mb-1.5" style={{ color:'rgba(255,255,255,0.6)' }}>
                  Confirm password
                </label>
                <div className="relative">
                  <input id="confirm" type={showCfm ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="Re-enter your password"
                    className="input-field w-full px-4 py-3 pr-16 rounded-xl text-sm"
                    style={{
                      background:'rgba(255,255,255,0.07)',
                      border: form.confirm
                        ? form.confirm === form.password
                          ? '1px solid rgba(52,211,153,0.5)'
                          : '1px solid rgba(239,68,68,0.5)'
                        : '1px solid rgba(255,255,255,0.12)',
                      color:'white'
                    }}
                    value={form.confirm} onChange={set('confirm')}/>
                  <button type="button" onClick={() => setShowCfm(p => !p)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color:'rgba(255,255,255,0.4)' }}>
                    {showCfm ? 'Hide' : 'Show'}
                  </button>
                </div>
                {form.confirm && form.confirm !== form.password && (
                  <p className="mt-1.5 text-xs" style={{ color:'#f87171' }}>Passwords do not match</p>
                )}
              </div>

              <div className="stagger-6 pt-1">
                <button type="submit" disabled={loading || pwScore < 4 || form.password !== form.confirm}
                  className="btn-shimmer w-full text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Creating account…</>
                    : "Create Account — It's Free →"}
                </button>
              </div>
            </form>

            <p className="mt-3 text-center text-xs" style={{ color:'rgba(255,255,255,0.2)' }}>
              By signing up you agree to our terms of service.
            </p>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.08)' }}/>
              <span className="text-xs" style={{ color:'rgba(255,255,255,0.25)' }}>or</span>
              <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.08)' }}/>
            </div>

            <p className="text-center text-sm" style={{ color:'rgba(255,255,255,0.45)' }}>
              Already have an account?{' '}
              <Link to="/login" className="font-semibold" style={{ color:'#a78bfa' }}
                onMouseEnter={e => e.target.style.color='#c4b5fd'}
                onMouseLeave={e => e.target.style.color='#a78bfa'}>
                Sign in →
              </Link>
            </p>
          </div>
        </div>

        <ScheduleSide />
      </div>
    </div>
  )
}
