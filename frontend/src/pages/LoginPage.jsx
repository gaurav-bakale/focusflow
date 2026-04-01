import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Extract a readable string from any API error shape ────────────────────────
// Pydantic validation errors return detail as an array of {loc, msg, type}
// Auth errors return detail as a plain string
function extractError(err) {
  const detail = err?.response?.data?.detail
  if (!detail) return 'Invalid email or password. Please try again.'
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
    0%,100%{ box-shadow:0 0 0 0 rgba(99,102,241,.4); }
    50%    { box-shadow:0 0 0 8px rgba(99,102,241,0); }
  }
  @keyframes float-up {
    0%  { opacity:0; transform:translateY(0) scale(.8); }
    20% { opacity:1; }
    80% { opacity:.8; }
    100%{ opacity:0; transform:translateY(-120px) scale(1.1); }
  }
  @keyframes timer-fill {
    from{ stroke-dashoffset:339.3; }
    to  { stroke-dashoffset:0; }
  }
  @keyframes check-draw {
    from{ stroke-dashoffset:30; }
    to  { stroke-dashoffset:0; }
  }
  @keyframes task-slide {
    from{ opacity:0; transform:translateX(-16px); }
    to  { opacity:1; transform:translateX(0); }
  }
  @keyframes shimmer-btn {
    0%  { background-position:-200% center; }
    100%{ background-position:200% center; }
  }
  .anim-blob-1{ animation:blob 10s ease-in-out infinite; }
  .anim-blob-2{ animation:blob 14s ease-in-out infinite reverse; }
  .anim-blob-3{ animation:blob 18s ease-in-out infinite 2s; }
  .anim-card  { animation:fade-up .55s cubic-bezier(.22,1,.36,1) forwards; }
  .logo-ring  { animation:pulse-ring 3s ease-in-out infinite; }
  .stagger-1  { animation:fade-up .5s  .05s cubic-bezier(.22,1,.36,1) both; }
  .stagger-2  { animation:fade-up .5s  .10s cubic-bezier(.22,1,.36,1) both; }
  .stagger-3  { animation:fade-up .5s  .15s cubic-bezier(.22,1,.36,1) both; }
  .stagger-4  { animation:fade-up .5s  .20s cubic-bezier(.22,1,.36,1) both; }
  .stagger-5  { animation:fade-up .5s  .25s cubic-bezier(.22,1,.36,1) both; }
  .btn-shimmer{
    background:linear-gradient(135deg,#6366f1,#8b5cf6,#6366f1);
    background-size:200% auto;
    transition:background-position .5s,transform .15s,box-shadow .15s;
  }
  .btn-shimmer:hover{
    background-position:right center;
    transform:translateY(-1px);
    box-shadow:0 8px 25px rgba(99,102,241,.45);
  }
  .btn-shimmer:active{ transform:translateY(0); }
  .input-field{ transition:border-color .2s,box-shadow .2s; }
  .input-field:focus{
    border-color:#6366f1 !important;
    box-shadow:0 0 0 3px rgba(99,102,241,.15);
    outline:none;
  }
  /* Side panel items */
  .float-icon{ animation:float-up 4s ease-in-out infinite; }
  .float-icon:nth-child(2){ animation-delay:1.3s; }
  .float-icon:nth-child(3){ animation-delay:2.6s; }
  .float-icon:nth-child(4){ animation-delay:0.65s; }
  .timer-ring{ animation:timer-fill 6s ease-in-out infinite alternate; stroke-dasharray:339.3; }
  .task-item-1{ animation:task-slide .5s .2s both; }
  .task-item-2{ animation:task-slide .5s .7s both; }
  .task-item-3{ animation:task-slide .5s 1.2s both; }
  .task-item-4{ animation:task-slide .5s 1.7s both; }
  .check-path{ stroke-dasharray:30; animation:check-draw .4s ease forwards; }
`

// ── Left decoration: animated Pomodoro timer ──────────────────────────────────
function PomodoroSide() {
  return (
    <div className="hidden xl:flex flex-col items-center gap-6 w-56 select-none">
      {/* Timer ring */}
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth="8"/>
          <circle cx="60" cy="60" r="54" fill="none" stroke="url(#timerGrad)" strokeWidth="8"
            strokeLinecap="round" className="timer-ring" style={{ transform:'rotate(-90deg)', transformOrigin:'center' }}/>
          <defs>
            <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1"/>
              <stop offset="100%" stopColor="#a78bfa"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white/90 text-2xl font-mono font-bold">25:00</span>
          <span className="text-white/40 text-xs mt-0.5">Focus</span>
        </div>
      </div>

      {/* Floating focus icons */}
      <div className="relative h-24 w-32 overflow-hidden">
        {['🎯','⚡','🧠','🔥'].map((icon, i) => (
          <span key={i} className="float-icon absolute text-2xl"
            style={{ left: `${[15,55,30,70][i]}%`, bottom: 0, animationDelay: `${i * 1.3}s`, animationDuration: '4s' }}>
            {icon}
          </span>
        ))}
      </div>

      <div className="text-center">
        <p className="text-white/60 text-sm font-semibold">Deep focus timer</p>
        <p className="text-white/30 text-xs mt-1">25-min Pomodoro cycles</p>
      </div>
    </div>
  )
}

// ── Right decoration: animated task list ──────────────────────────────────────
function TaskListSide() {
  const items = [
    { label: 'Design landing page', done: true,  color: '#f87171' },
    { label: 'Review pull request',  done: true,  color: '#fbbf24' },
    { label: 'Write unit tests',     done: false, color: '#818cf8' },
    { label: 'Ship v2 release',      done: false, color: '#34d399' },
  ]
  return (
    <div className="hidden xl:flex flex-col items-start gap-4 w-56 select-none">
      <div className="text-center w-full mb-1">
        <p className="text-white/60 text-sm font-semibold">Smart task board</p>
        <p className="text-white/30 text-xs mt-1">Track everything in one place</p>
      </div>
      {items.map((item, i) => (
        <div key={i} className={`task-item-${i + 1} w-full flex items-center gap-3 px-4 py-3 rounded-xl`}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
            style={{ background: item.done ? item.color + '33' : 'transparent', border: `2px solid ${item.color}50` }}>
            {item.done && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path className="check-path" d="M2 6l3 3 5-5" stroke={item.color} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="text-xs font-medium flex-1 truncate"
            style={{ color: item.done ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)',
                     textDecoration: item.done ? 'line-through' : 'none' }}>
            {item.label}
          </span>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
        </div>
      ))}
    </div>
  )
}

const FEATURES = [
  { icon: '🎯', label: 'Deep focus timer' },
  { icon: '✅', label: 'Smart task board' },
  { icon: '📅', label: 'Visual calendar'  },
  { icon: '✨', label: 'AI assistant'     },
]

export default function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [form, setForm]     = useState({ email: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      navigate(user.onboarding_completed === false ? '/onboarding' : '/')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-10"
      style={{ background: 'linear-gradient(135deg,#0f0c29,#1a1535,#24243e)' }}>
      <style>{ANIM_CSS}</style>

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="anim-blob-1 absolute w-96 h-96 opacity-20"
          style={{ background:'radial-gradient(circle,#6366f1,#8b5cf6)', top:'-8%', left:'-8%', filter:'blur(48px)' }}/>
        <div className="anim-blob-2 absolute w-80 h-80 opacity-15"
          style={{ background:'radial-gradient(circle,#a78bfa,#ec4899)', bottom:'-10%', right:'-5%', filter:'blur(56px)' }}/>
        <div className="anim-blob-3 absolute w-64 h-64 opacity-10"
          style={{ background:'radial-gradient(circle,#38bdf8,#6366f1)', top:'40%', right:'15%', filter:'blur(40px)' }}/>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage:'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize:'48px 48px' }}/>
      </div>

      {/* Three-column layout: left deco | card | right deco */}
      <div className="relative flex items-center justify-center gap-12 w-full max-w-5xl mx-auto">
        <PomodoroSide />

        {/* Card */}
        <div className="anim-card w-full max-w-md shrink-0"
          style={{ background:'rgba(255,255,255,0.04)', backdropFilter:'blur(24px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'24px', boxShadow:'0 32px 80px rgba(0,0,0,0.5)' }}>
          <div className="px-8 py-10">

            {/* Logo */}
            <div className="stagger-1 flex flex-col items-center mb-7">
              <div className="logo-ring w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background:'linear-gradient(135deg,#6366f1,#a78bfa)' }}>
                <span className="text-white text-2xl font-black">F</span>
              </div>
              <span className="text-white text-xl font-bold tracking-tight">FocusFlow</span>
              <span className="text-white/40 text-xs mt-1 tracking-widest uppercase">Your deep work application</span>
            </div>

            {/* Feature pills */}
            <div className="stagger-2 flex flex-wrap justify-center gap-2 mb-7">
              {FEATURES.map(({ icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background:'rgba(99,102,241,0.15)', color:'#c4b5fd', border:'1px solid rgba(99,102,241,0.25)' }}>
                  <span>{icon}</span>{label}
                </span>
              ))}
            </div>

            {/* Heading */}
            <div className="stagger-3 text-center mb-7">
              <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
              <p className="text-white/50 text-sm">Sign in to continue your focus journey</p>
            </div>

            {/* Error — stays until user submits again */}
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
                <label htmlFor="email" className="block text-xs font-semibold mb-1.5" style={{ color:'rgba(255,255,255,0.6)' }}>
                  Email address
                </label>
                <input id="email" type="email" required autoComplete="email" placeholder="you@example.com"
                  className="input-field w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'white' }}
                  value={form.email} onChange={set('email')}/>
              </div>

              <div className="stagger-4">
                <label htmlFor="password" className="block text-xs font-semibold mb-1.5" style={{ color:'rgba(255,255,255,0.6)' }}>
                  Password
                </label>
                <div className="relative">
                  <input id="password" type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                    placeholder="••••••••"
                    className="input-field w-full px-4 py-3 pr-16 rounded-xl text-sm"
                    style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'white' }}
                    value={form.password} onChange={set('password')}/>
                  <button type="button" onClick={() => setShowPw(p => !p)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color:'rgba(255,255,255,0.4)' }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="stagger-5 pt-1">
                <button type="submit" disabled={loading}
                  className="btn-shimmer w-full text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in…</>
                    : 'Sign In →'}
                </button>
              </div>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.08)' }}/>
              <span className="text-xs" style={{ color:'rgba(255,255,255,0.25)' }}>or</span>
              <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.08)' }}/>
            </div>

            <p className="text-center text-sm" style={{ color:'rgba(255,255,255,0.45)' }}>
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-semibold" style={{ color:'#a78bfa' }}
                onMouseEnter={e => e.target.style.color='#c4b5fd'}
                onMouseLeave={e => e.target.style.color='#a78bfa'}>
                Sign up free →
              </Link>
            </p>
          </div>
        </div>

        <TaskListSide />
      </div>
    </div>
  )
}
